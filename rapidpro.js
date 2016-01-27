var http = require('http');
var convert = require('./convert');

exports.process = function( type, nconf, db, mongo, resource, callback ) {
    if ( type == 'create' || type == 'update' || type == 'failed' ) {
        if ( !resource.sent ) {
            sendMessage( nconf, db, resource, callback );
        } else {
            console.log("Not sending because sent on " +resource.sent);
            callback();
        }
    } else if ( type == 'sent' ) {
        if ( resource.event ) {
            if ( resource.event == 'mt_sent' || resource.event == 'mt_dlvd' ) {
                findResource( resource, db, function ( communication, recipient ) {
                    if ( communication ) {
                        eventDate = new Date();
                        if ( resource.event == 'mt_sent' && !communication.sent ) {
                            communication.sent = eventDate;
                        }
                        if ( resource.event == 'mt_dlvd' && !communication.received ) {
                            communication.received = eventDate;
                        }
                        if ( communication.status != 'completed' ) {
                            communication.status = 'in-progress';
                        }
                        if ( !communication.extension ) {
                            communication.extension = [];
                        }
                        communication.extension.push( { url : "Communication.dissemination", extension : [
                            { url : "Communication.dissemination.status", valueCodeableConcept : { coding : { code: "in-progress", system : "2.16.840.1.113883.4.642.1.79" } } },
                            { url : "Communication.dissemination.timestamp", valueInstant : eventDate },
                            { url : "Communication.dissemination.recipient", valueReference : recipient },
                            ] } );
                        /*
                        if ( !communication.dissemination ) {
                            communication.dissemination = [];
                        }
                        communication.dissemination.push( {status : 'in-progress', timestamp : new Date(), recipient: recipient } );
                        */
                        callback( communication );
                    }
                });
            }
        }
    } else if ( type == 'response' ) {
        console.log("got response code");
        findResourceByRun( resource.run, resource, db, function( communication, recipient ) {
            if ( communication ) {
                eventDate = new Date();
                communication.status = 'completed';
                if ( !communication.received ) {
                    communication.received = eventDate;
                }
                if ( !communication.extension ) {
                    communication.extension = [];
                }
                communication.extension.push( { url : "Communication.dissemination", extension : [
                    { url : "Communication.dissemination.status", valueCodeableConcept : { coding : { code: "completed", system : "2.16.840.1.113883.4.642.1.79" } } },
                    { url : "Communication.dissemination.timestamp", valueInstant : eventDate },
                    { url : "Communication.dissemination.response", valueString : resource.text },
                    { url : "Communication.dissemination.recipient", valueReference : recipient },
                    ] } );
                /*
                if ( !communication.dissemination ) {
                    communication.dissemination = [];
                }
                communication.dissemination.push( {status : 'completed', timestamp : new Date(), response : resource.text, recipient: recipient } );
                */
                callback( communication );
            }
        });

    }
};

function sendMessage( nconf, db, resource, callback ) {

    var msg;
    for( i in resource.payload ) {
        if ( resource.payload[i].contentString ) {
            msg = resource.payload[i].contentString;
        }
    }
    if ( !msg ) {
        for( i in resource.payload ) {
            if ( resource.payload[i].contentAttachment && resource.payload[i].contentAttachment.title ) {
                msg = resource.payload[i].contentAttachment.title;
            }
    }
    }
    console.log("Payload is "+msg);
    if ( !msg ) {
        console.log("Unable to decipher message from "+resource.id);
    } else {

        for( i in resource.recipient ) {
            if ( resource.recipient[i].contained ) {
                var ref = resource.recipient[i].contained;
                runRapidPro(ref, msg, nconf, db, resource, callback);
            } else if ( resource.recipient[i].reference ) {
                console.log("looking for "+resource.recipient[i].reference);
                if ( /^[A-Za-z]+\/\w+/.test( resource.recipient[i].reference ) ) {
                    // No local lookup options, so just send through for testing...
                    runRapidPro({}, msg, nconf, db, resource, callback);
                } else {
                    var req = http.get(resource.recipient[i].reference, function (res) {
                        var body = '';
                        res.on('data', function(chunk) {
                            body += chunk;
                        });
                        res.on('end', function() {
                            if ( res.headers['content-type'] == 'application/fhir+json' ) {
                                var ref = JSON.parse(body);
                                runRapidPro(ref, msg, nconf, db, resource, callback);
                            } else if ( res.headers['content-type'] == 'application/fhir+xml' ) {
                                convert.format( 'xml', req.body, function( err, converted ) {
                                    if ( err ) {
                                        console.log("Failed to convert remote resource to JSON: "+resource.recipient[i].reference);
                                        console.log(err);
                                    } else {
                                        updateCommunication( req.params.fhir_id, JSON.parse(converted), res, req );
                                        runRapidPro(JSON.parse(converted), msg, nconf, db, resource, callback);
                                    }
                                });
                            } else {
                                console.log("Invalid content type for "+resource.recipient[i].reference);
                            }
                        });
                        res.on('error', function(e) {
                            console.log("Error trying to access "+resource.recipient[i].reference);
                            console.log(e);
                        });
                    });
                    req.on('error', function(req_err) {
                        console.log("Got error on request to rapidpro");
                        console.log(req_err);
                    });
                }
            }
        }

    }
   
}

function runRapidPro( recipient, msg, nconf, db, resource, callback ) {
    var rp_map = db.collection("contact_communication");
    var phone;
    if ( recipient.telecom && Array.isArray( recipient.telecom ) && recipient.telecom.length > 0 ) {
        for ( j in recipient.telecom ) {
            if ( recipient.telecom[j].use && recipient.telecom[j].use == 'mobile' ) {
                phone = recipient.telecom[j].value;
                break;
            }
        }
        if ( !phone ) {
            // Default to first number if no mobile for now.
            phone = recipient.telecom[0].value;
        }
    }
    if ( !phone ) {
        // Check for testing number if nothing is found.
        phone = nconf.get("rapidpro:testing");
    }
    if ( !phone ) {
        return;
    }
    var postdata = JSON.stringify({
        "flow_uuid": nconf.get("rapidpro:flow_uuid"),
        "extra" : {
            "msg" : msg,
            "id" : resource.id
        },
        "phone" : [ phone ]
    });
    var req = http.request( {
        hostname : nconf.get("rapidpro:host"),
        port : nconf.get("rapidpro:port"),
        path : "/api/v1/runs.json",
        headers : {
            'Content-Type': "application/json",
        'Authorization' : nconf.get("rapidpro:token"),
        'Content-Length' : postdata.length
        },
        method : 'POST' }, function( res ) {
            console.log("RapidPro Status: " +res.statusCode );
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                console.log("RapidPro response: "+body);
                try {
                    var details = JSON.parse( body );
                    for( i in details ) {
                        var detail = details[i];
                        rp_map.insertOne( { "phone": phone, recipient : resource.recipient[i], contact: detail.contact, text: msg, time: detail.created_on, run: detail.run, id: resource.id }, function( err, r ) {
                            if ( err ) {
                                console.log("Failed to insert contact_communication");
                                console.log(err);
                                resource.status = 'failed';
                            } else {
                                resource.status = 'in-progress';
                            }
                        });
                    }
                } catch ( err ) {
                    console.log("Failed to parse rapid pro response.");
                    console.log(err);
                    resource.status = 'failed';
                }
                callback( resource );
            });
            res.on('error', function(e) {
                console.log("RapidPro error: " +e.message);
                resource.status = 'failed';
                callback( resource );
            });
        });
    req.on('error', function( req_err ) {
        console.log("Got error on request to rapidpro");
        console.log(req_err);
        resource.status = 'failed';
        callback( resource );
    });
    req.write(postdata);
    req.end();
}

function findResource( rp_event, db, callback ) {
    var findArgs = { phone : rp_event.phone, text : rp_event.text };
    var rp_map = db.collection("contact_communication");

    rp_map.findOne( findArgs, { "id" : 1, "recipient" : 1 }, { sort : [['time','desc']] }, function( err, doc ) {
        if ( err ) {
            console.log("Failed to find resource for ");
            console.log(findArgs);
        } else {
            var comm = db.collection("Communication");
            comm.findOne( {id:doc.id}, function( err, communication ) {
                if ( err ) {
                    console.log("Failed to get resource for " +doc.id);
                    console.log(err);
                } else {
                    callback( communication, doc.recipient );
                }
            });
        }
    });
}
function findResourceByRun( run, rp_event, db, callback ) {
    var findArgs = { phone : rp_event.phone, run : parseInt(run) };
    var rp_map = db.collection("contact_communication");
    console.log("looking for ");
    console.log(findArgs);

    rp_map.findOne( findArgs, { "id" : 1, "recipient" : 1 }, { sort : [['time','desc']] }, function( err, doc ) {
        if ( err ) {
            console.log("Failed to find resource for ");
            console.log(findArgs);
        } else {
            if ( !doc ) {
                console.log("Failed to find contact_communication for:");
                console.log(findArgs);
            } else {
                var comm = db.collection("Communication");
                comm.findOne( {id:doc.id}, function( err, communication ) {
                    if ( err ) {
                        console.log("Failed to get resource for " +doc.id);
                        console.log(err);
                    } else {
                        callback( communication, doc.recipient );
                    }
                });
            }
        }
    });
}

process.on('uncaughtException', function(err) {
    console.log("Unhandled exception:");
    console.log(err);
});
