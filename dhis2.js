/*
 * Options for config.json:
 * "dhis2": {
 *     "system" : "https://apps.dhis2.org/demo/api/users",
 *     "protocol" : "http",
 *     "host" : "demo.dhis2.org",
 *     "base" : "/demo",
 *     "port" : "80",
 *     "user" : "username",
 *     "pass" : "password",
 *     "subject" : "Alert from emNutt"
 * }
 */
var http = require('http');
var https = require('https');
var convert = require('./convert');

exports.process = function( type, nconf, db, mongo, resource, callback ) {
    if ( type == 'create' || type == 'update' || type == 'failed' ) {
        if ( !resource.sent ) {
            sendMessage( nconf, db, resource, callback );
        } else {
            console.log("Not sending because sent on " +resource.sent);
            callback();
        }
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
                createMessage(ref, msg, nconf, db, resource, callback);
            } else if ( resource.recipient[i].reference ) {
                console.log("looking for "+resource.recipient[i].reference);
                if ( /^[A-Za-z]+\/\w+/.test( resource.recipient[i].reference ) ) {
                    // No local lookup options, so just send through for testing...
                    //createMessage({}, msg, nconf, db, resource, callback);
                    console.log("No recipient found for "+resource.recipient[i].reference+" so nothing to do.");
                } else {
                    var req = http.get(resource.recipient[i].reference, function (res) {
                        var contentType = res.headers['content-type'].split(';')[0];
                        var body = '';
                        res.on('data', function(chunk) {
                            body += chunk;
                        });
                        res.on('end', function() {
                            if ( contentType == 'application/json+fhir' || contentType == 'application/json' ) {
                                var ref = JSON.parse(body);
                                createMessage(ref, msg, nconf, db, resource, callback);
                            } else if ( contentType == 'application/xml+fhir' || contentType == 'application/xml' ) {
                                convert.format( 'xml', req.body, function( err, converted ) {
                                    if ( err ) {
                                        console.log("Failed to convert remote resource to JSON: "+resource.recipient[i].reference);
                                        console.log(err);
                                    } else {
                                        updateCommunication( req.params.fhir_id, JSON.parse(converted), res, req );
                                        createMessage(JSON.parse(converted), msg, nconf, db, resource, callback);
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

function createMessage( recipient, msg, nconf, db, resource, callback ) {
    var user;

    var system = nconf.get("dhis2:system");
    if ( !system ) {
        system = nconf.get("dhis2:protocol")+"://"+nconf.get("dhis2:host");
        if ( ( nconf.get("dhis2:protocol") == "http" && parseInt(nconf.get("dhis2:port")) != 80 ) 
                || ( nconf.get("dhis2:protocol") == "https" && parseInt(nconf.get("dhis2:port")) != 443 ) ) {
            system += ":"+nconf.get("dhis2:port");
        }
        if ( nconf.get("dhis2:base") ) {
            system += nconf.get("dhis2:base");
        }
        system += "/api/users";
    }

    if ( recipient.identifier && Array.isArray( recipient.identifier ) && recipient.identifier.length > 0 ) {
        for ( j in recipient.identifier ) {
            if ( recipient.identifier[j].system && recipient.identifier[j].system == system ) {
                user = recipient.identifier[j].value;
                break;
            }
        }
    }
    if ( !user ) {
        // Check for testing number if nothing is found.
        user = nconf.get("rapidpro:testing");
    }
    if ( !user ) {
        return;
    }
    var postdata = JSON.stringify({
        subject: nconf.get("dhis2:subject"),
        text: msg,
        users: [
        { id : user }
        ]
    });

    var proto = http;
    if ( nconf.get("dhis2:protocol") == "https" ) {
        proto = https;
    }
        
    var req = proto.request( {
        hostname : nconf.get("dhis2:host"),
        port : nconf.get("dhis2:port"),
        path : nconf.get("dhis2:base") + "/api/messageConversations",
        headers : {
            'Content-Type': "application/json",
            'Authorization' : "Basic " + new Buffer(nconf.get("dhis2:user")+":"+nconf.get("dhis2:pass")).toString('base64'),
            'Content-Length' : postdata.length
        },
        method : 'POST' }, function( res ) {
            console.log("DHIS2 Status: " +res.statusCode );
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                console.log("DHIS2 response: "+body);
                resource.status = 'completed';
                callback( resource );
            });
            res.on('error', function(e) {
                console.log("DHIS2 error: " +e.message);
                resource.status = 'failed';
                callback( resource );
            });
        });
    req.on('error', function( req_err ) {
        console.log("Got error on request to DHIS2");
        console.log(req_err);
        resource.status = 'failed';
        callback( resource );
    });
    req.write(postdata);
    req.end();
}
