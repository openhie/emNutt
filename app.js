var express = require('express');
//var path = require('path');
//var logger = require('morgan');
//var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongo = require('mongodb');
var nconf = require("nconf");

var spawn = require('child_process').spawn;

var FHIR = require('fhir');
var fhir = new FHIR(FHIR.DSTU2);

nconf.defaults( { 
    "app:port" : 3000, 
    "app:plugins" : [],
    "app:default_mime_type" : "application/json+fhir",
    "mongo:uri" : "mongodb://localhost/emNutt"
} );

nconf.argv().file("config.json");

var app = express();

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
//app.use(logger('dev'));
app.use(bodyParser.json( { type : "application/json" } ));
app.use(bodyParser.json( { type : "application/json+fhir" } ));
app.use(bodyParser.text( { type : "application/xml" } ));
app.use(bodyParser.text( { type : "application/xml+fhir" } ));
app.use(bodyParser.urlencoded({ extended: false }));
//app.use(cookieParser());
//

var plugin_list = nconf.get("app:plugins");
var plugins = Array();

for ( var i=0, end=plugin_list.length; i < end; i++ ) {
    plugins[i] = require("./"+plugin_list[i]);
}

var uri = nconf.get("mongo:uri");
var port = nconf.get("app:port");

var MongoClient = mongo.MongoClient;
var db;

MongoClient.connect(uri, function( err, database ) {
    if ( err ) throw err;
    console.log("connecting to db");
    db = database;

    app.listen(port);
    console.log("Listening on port 3000");
});

app.get("/fhir/Communication/:fhir_id", function( req, res ) {

    getCommunication( req.params.fhir_id, function( err, doc ) {
        if ( err ) {
            res.status(404);
            res.json({"err":err});
        } else if ( !doc ) {
            res.status(404);
            res.json({err:"Not found"});
        } else {
            res.setHeader("Last-Modified", doc.meta.lastUpdated);
            res.setHeader("ETag", doc.meta.versionId);
    
            if ( req.query._format && ( req.query._format == "application/xml+fhir" || req.query._format == "application/xml" ) ) {
                convertFormat( 'json', JSON.stringify(doc), function( err, converted ) {
                    if ( err ) {
                        res.status(500);
                        res.json({err:"Failed to convert to XML"});
                        console.log("Failed to convert JSON to XML");
                        console.log(err);
                    } else {
                        res.status(200);
                        res.type("application/xml+fhir");
                        res.send( converted );
                    }
                    res.end();
                });
            } else {
                res.status(200);
                res.type("application/json+fhir");
                res.json(doc);
                res.end();
            }
        }
    });
});

app.get("/fhir/Communication/:fhir_id/_history/:vid", function( req, res ) {

    getCommunication( req.params.fhir_id, req.params.vid, function ( err, doc ) {
        if ( err ) {
            res.status(404);
            res.json({"err":err});
        } else if ( !doc ) {
            res.status(404);
            res.json({err:"Not found"});
        } else {
            res.setHeader("Last-Modified", doc.meta.lastUpdated);
            res.setHeader("ETag", doc.meta.versionId);
    
            if ( req.query._format && ( req.query._format == "application/xml+fhir" || req.query._format == "application/xml" ) ) {
                convertFormat( 'json', JSON.stringify(doc), function( err, converted ) {
                    if ( err ) {
                        res.status(500);
                        res.json({err:"Failed to convert to XML"});
                        console.log("Failed to convert JSON to XML");
                        console.log(err);
                    } else {
                        res.status(200);
                        res.type("application/xml+fhir");
                        res.send( converted );
                    }
                    res.end();
                });
            } else {
                res.status(200);
                res.type("application/json+fhir");
                res.json(doc);
                res.end();
            }
        }
    });
});


app.post("/fhir/Communication", function( req, res ) {
    var comm = db.collection("Communication");
    var origContentType = ( req.headers['content-type'] ? req.headers['content-type'] : ( req.query._format ? req.query._format : nconf.get("app:default_mime_type") ) );
    var contentType = origContentType.split(';')[0];
    if ( req.headers['if-none-exist'] ) {
        res.status(412);
        res.json({err:"Conditional create not supported."});
        res.end();
    } else if ( contentType == "application/xml+fhir" || contentType == "application/xml" ) {
        if ( !fhir.ValidateXMLResource( req.body ) ) {
            res.status(400);
            res.json({err:"Invalid XML FHIR resource)."});
            res.end();
            console.log("not valid should be 400");
        } else {
            convertFormat( 'xml', req.body, function( err, converted ) {
                if ( err ) {
                    res.status(500);
                    res.json({err:"Failed to convert XML to JSON"});
                    res.end();
                } else {
                    createCommunication( JSON.parse(converted), res, req );
                }
            });
        }
    } else if ( contentType == "application/json+fhir" || contentType == "application/json" ) { 
        if ( !fhir.ValidateJSResource( req.body ) ) {
            res.status(400);
            res.json({err:"Invalid JSON FHIR resource)."});
            res.end();
        } else {
            createCommunication( req.body, res, req );
        }
    } else {
        res.status(400);
        res.json({err:"Invalid content type: "+contentType+" ("+origContentType+")"});
        res.end();
    }
});

app.put("/fhir/Communication/:fhir_id", function( req, res ) {
    var comm = db.collection("Communication");
    var origContentType = ( req.headers['content-type'] ? req.headers['content-type'] : ( req.query._format ? req.query._format : nconf.get("app:default_mime_type") ) );
    var contentType = origContentType.split(';')[0];
    if ( contentType == "application/xml+fhir" || contentType == "application/xml" ) {
        if ( !fhir.ValidateXMLResource( req.body ) ) {
            res.status(400);
            res.json({err:"Invalid XML FHIR resource)."});
            res.end();
            console.log("not valid should be 400");
        } else {

            convertFormat( 'xml', req.body, function( err, converted ) {
                if ( err ) {
                    res.status(500);
                    res.json({err:"Failed to convert XML to JSON"});
                    res.end();
                } else {
                    updateCommunication( req.params.fhir_id, JSON.parse(converted), res, req );
                }
            });
        }
    } else if ( contentType == "application/json+fhir" || contentType == "application/json" ) { 
        if ( !fhir.ValidateJSResource( req.body ) ) {
            res.status(400);
            res.json({err:"Invalid JSON FHIR resource)."});
            res.end();
        } else {
            updateCommunication( req.params.fhir_id, req.body, res, req );
        }
    } else {
        res.status(400);
        res.json({err:"Invalid content type: "+contentType+" ("+origContentType+")"});
        res.end();
    }
});

app.get("/fhir/Communication", function( req, res ) {
    console.log(req.query);
    searchCommunication(req.query, null, req, res);
});

app.post("/fhir/Communication/_search", function( req, res ) {
    console.log(req.query);
    console.log(req.body);
    searchCommunication(req.query, req.body, req, res);
});

app.post('/fhir/Communication/\\$sent', function( req, res ) {
    console.log("GOT Sent");
    console.log(req.body);
    processPlugins( 'sent', req.body );
    res.status(200);
    res.write("OK");
    res.end();
});
app.post('/fhir/Communication/\\$response', function( req, res ) {
    console.log("GOT Response");
    console.log(req.body);
    processPlugins( 'response', req.body );
    res.status(200);
    res.write("OK");
    res.end();
});



function copyToHistory( fhir_id ) {
    comm = db.collection("Communication");
    history = db.collection("history");

    comm.find({id:fhir_id}, {"_id":false}).forEach( function(doc) {
        history.insertOne(doc, function( err, r ) {
            if ( err ) throw err;
        });
    });
}

function getCommunication( fhir_id, version_id, callback ) {
    if ( typeof callback === 'undefined' ) {
        callback = version_id;
        version_id = false;
    }

    var collection;
    var find_args;

    if (version_id) {
        find_args = { id : fhir_id, "meta.versionId" : parseInt( version_id ) };
        collection = db.collection("history");
    } else {
        find_args = { id : fhir_id };
        collection = db.collection("Communication");
    }

    collection.findOne( find_args, {"_id":false}, function( err, doc ) {
        if ( err ) throw err;
        
        if ( !doc ) {
            return callback( "Not found" );
        } else {
            return callback( undefined, doc );
        }
    });

}

function getVersion( fhir_id, callback ) {

    var comm = db.collection("Communication");

    comm.findOne( { id : fhir_id }, { "meta.versionId" : 1 }, function( err, doc ) {
        if ( err ) {
            return callback( "Failed to find "+fhir_id );
        }
        return callback( undefined, doc );
    });

}

function internalUpdate( resource ) {
    comm = db.collection("Communication");

    resource.meta.lastUpdated = new Date();
    resource.meta.versionId++;

    comm.updateOne( { id: resource.id }, { $set : resource }, function ( err, r ) {
        if ( err ) {
            console.log("Failed to update "+resource.id);
            console.log(err);
        } else {
            try {
                copyToHistory( resource.id );
            } catch( err ) {
                console.log("Failed to save history");
                console.log(err);
            }
        }
    });
}

function updateCommunication( fhir_id, resource, response, request ) {
    /*
    if ( !request.headers['if-match'] ) {
        response.status(412);
        response.json({err:"If-Match header is missing and must be supplied)."});
        response.end();
    } else {
    */
        getVersion( fhir_id, function ( err, data ) {
            console.log("get version found:");
            console.log(data);
            console.log(err);
            if ( !data ) {
                if ( resource.resourceType != "Communication" ) {
                    response.status(404);
                    response.json({err:"Invalid resourceType (not Communication)."});
                    response.end();
                } else if ( resource.id != fhir_id ) {
                    response.status(400);
                    response.json({err:"ID doesn't match for update."});
                    response.end();
                } else {
                    comm = db.collection("Communication");

                    if ( !resource.meta ) {
                        resource.meta = { lastUpdated : new Date(), versionId : 1 };
                    } else {
                        resource.meta.lastUpdated = new Date();
                        if ( !resource.meta.versionId ) {
                            resource.meta.versionId = 1;
                        }
                    }
                    if ( resource.sent ) {
                        resource.sent = new Date( resource.sent );
                    }
                    if ( resource.received ) {
                        resource.received = new Date( resource.received );
                    }
                    comm.insertOne( resource, function ( err, r ) {
                        if ( err ) {
                            response.status(400);
                            response.end();
                            console.log("Failed to insert into database.");
                            console.log(err);
                        } else {
                            try {
                                copyToHistory( resource.id );
                            } catch (err) {
                                console.log("Failed to save history.");
                                console.log(err);
                            }
                            response.status(201);
                            response.location( "http://"+request.headers.host+"/fhir/Communication/"+resource.id+"/_history/"+resource.meta.versionId );
                            response.end();
                            processPlugins( 'create', resource );
                            console.log("Saved " +resource.id+" to database.");
                        }
                    });
                }

            } else {
                if ( !request.headers['if-match'] ) {
                    response.status(412);
                    response.json({err:"If-Match header is missing and must be supplied)."});
                    response.end();
                } else {
                    if ( data.meta.versionId != request.headers['if-match'] ) {
                        response.status(409);
                        response.json({err:"Version id from If-Match headers doesn't match current version."});
                        response.end();
                    } else if ( resource.resourceType != "Communication" ) {
                        response.status(404);
                        response.json({err:"Invalid resourceType (not Communication)."});
                        response.end();
                    } else if ( resource.id != fhir_id ) {
                        response.status(400);
                        response.json({err:"ID doesn't match for update."});
                        response.end();
                    } else {
                        comm = db.collection("Communication");

                        if ( !resource.meta ) {
                            resource.meta = { lastUpdated : new Date(), versionId : data.meta.versionId+1 };
                        } else {
                            resource.meta.lastUpdated = new Date();
                            resource.meta.versionId = data.meta.versionId+1;
                        }
                        if ( resource.sent ) {
                            resource.sent = new Date( resource.sent );
                        }
                        if ( resource.received ) {
                            resource.received = new Date( resource.received );
                        }

                        comm.updateOne( { id: fhir_id }, { $set : resource },
                                function( err, r ) {
                                    if ( err ) {
                                        response.status(400);
                                        response.end();
                                        console.log("Failed to update "+fhir_id+" database.");
                                        console.log(err);
                                    } else {
                                        try {
                                            copyToHistory( resource.id );
                                        } catch (err) {
                                            console.log("Failed to save history.");
                                            console.log(err);
                                        }
                                        response.status(201);
                                        response.location( "http://"+request.headers.host+"/fhir/Communication/"+resource.id+"/_history/"+(data.meta.versionId+1) );
                                        response.end();
                                        processPlugins( 'update', resource );
                                        console.log("Saved " +resource.id+" to database.");
                                    }
                                });
                    }
                }
            }
        });
    //}
}

function createCommunication( resource, response, request ) {
    if ( resource.resourceType != "Communication" ) {
        response.status(404);
        response.json({err:"Invalid resourceType (not Communication)."});
        response.end();
    } else if ( resource.id && resource.id != '' ) {
        response.status(400);
        response.json({err:"ID should not be set for create."});
        response.end();
    } else {
        if ( !resource.meta ) {
            resource.meta = { versionId : 1, lastUpdated : new Date() };
        } else {
            resource.meta.versionId = 1;
            resource.meta.lastUpdated = new Date();
        }
        resource.id = new mongo.ObjectId().toHexString();
        if ( resource.sent ) {
            resource.sent = new Date( resource.sent );
        }
        if ( resource.received ) {
            resource.received = new Date( resource.received );
        }

        comm = db.collection("Communication");

        comm.insertOne( resource, function ( err, r ) {
            if ( err ) {
                response.status(400);
                response.end();
                console.log("Failed to insert into database.");
                console.log(err);
            } else {
                try {
                    copyToHistory( resource.id );
                } catch (err) {
                    console.log("Failed to save history.");
                    console.log(err);
                }
                response.status(201);
                response.location( "http://"+request.headers.host+"/fhir/Communication/"+resource.id+"/_history/1" );
                response.end();
                processPlugins( 'create', resource );
                console.log("Saved " +resource.id+" to database.");
            }
        });
    }

}

function searchCommunication( query, post, request, response ) {
    var find_args = {};
    if ( query ) {
        for( i in query ) {
            var search = parseSearch( i, query[i] );
            for ( j in search ) {
                find_args[j] = search[j];
            }
        }
    }
    if ( post ) {
        for( i in post ) {
            var search = parseSearch( i, query[i] );
            for ( j in search ) {
                find_args[j] = search[j];
            }
        }
    }
    console.log("search terms are:"+JSON.stringify(find_args,null,2));
    if ( Object.keys(find_args).length == 0 ) {
        response.status(500);
        response.json({err:"No search terms generated."});
        response.end();
    } else {

        var comm = db.collection("Communication");
        var bundle = { resourceType : 'Bundle',
            type : 'searchset',
            entry : []
        };
        comm.find( find_args, {"_id" : false } ).toArray( function( err, docs ) {
            if ( err ) {
                response.status(400);
                response.end();
            } else {
                bundle.total = docs.length;
                for( i in docs ) {
                    bundle.entry.push( { fullUrl : "http://"+request.headers.host+"/Communication/"+docs[i].id+"/_history/"+docs[i].meta.versionId,
                        resource : docs[i],
                        search : { mode : 'match', score : 1 }
                    } );
                }
                response.status(200);
                if ( request.query._format && ( request.query._format == "application/xml+fhir" || request.query._format == "application/xml" ) ) {
                    response.type("application/xml+fhir");
                    response.send( fhir.ObjectToXml(bundle) );
                } else {
                    response.type("application/json+fhir");
                    response.json(bundle);
                }
                response.end();
            }

        });
    }

}

function parseSearch( key, value ) {
    var prefix = value.substring(0,2);
    var prefixes = [ 'eq', 'ne', 'gt', 'lt', 'ge', 'le', 'sa', 'eb', 'ap' ];
    if ( prefixes.indexOf( prefix ) != -1 ) {
        value = value.substring(2);
    } else {
        prefix = 'eq';
    }

    switch( key ) {
        case '_id' :
            return {id : parsePrefix( prefix, value ) };
            break;
        case '_lastUpdated' :
            return {"meta.lastUpdated" : parsePrefix( prefix, value ) };
            break;
        case '_language' :
            return {"language" : parsePrefix( prefix, value ) };
            break;
        case '_profile' :
            return {"meta.profile" : parsePrefix( prefix, value ) };
            break;
        case '_security' :
            return {"meta.security" : parsePrefix( prefix, value ) };
            break;
        case '_tag' :
            return {"meta.tag" : parsePrefix( prefix, value ) };
            break;
        case 'category' :
            return {"category.coding.code" : parsePrefix( prefix, value ) };
            break;
        case 'encounter' :
            return {encounter : parsePrefix( prefix, value ) };
            break;
        case 'identifier' :
            return {"identifier.value" : parsePrefix( prefix, value ) };
            break;
        case 'status' :
            return {"status" : parsePrefix( prefix, value ) };
            break;
        case "subject" :
            if ( prefix == 'eq' ) {
                return parseReference( 'subject', value );
            } else {
                console.log("Don't know how to handle reference search other than eq for subject.");
                return { subject : parsePrefix( prefix, value ) };
            }
        case "recipient" :
            if ( prefix == 'eq' ) {
                return parseReference( 'recipient', value );
            } else {
                console.log("Don't know how to handle reference search other than eq for recipient.");
                return { subject : parsePrefix( prefix, value ) };
            }
        case "received" :
            return { 'received' : parsePrefix( prefix, new Date(value) ) };
        case "sent" :
            return { 'sent' : parsePrefix( prefix, new Date(value) ) };
        case 'priority' :
            //return {"priority.coding.code" : parsePrefix( prefix, value ) };
            return { extension : { $elemMatch : { url : "Communication.priority", "valueCodeableConcept.coding.code" : parsePrefix( prefix, value ) } } };
            break;
        case 'characteristic' :
            //return {"characteristic.coding.code" : parsePrefix( prefix, value ) };
            return { extension : { $elemMatch : { url : "Communication.characteristic", "valueCodeableConcept.coding.code" : parsePrefix( prefix, value ) } } };
            break;
        case 'period' :
            if ( prefix == 'eq' ) {
                return {"period.start" : parsePrefix( 'le', value ), "period.end" : parsePrefix( 'ge', value ) };
            } else {
                return {"period.start" : parsePrefix( prefix, value ) };
            }
            break;
        case 'dissemination.timestamp' :
            //return {"dissemination.timestamp" : parsePrefix( prefix, value ) };
            return { extension : { $elemMatch : { url : "Communication.dissemination", extension : { $elemMatch : { url : "Communication.dissemination.timestamp", valueInstant : parsePrefix( prefix, value ) } } } } };
            break;
        case 'dissemination.code' :
            //return {"dissemination.code" : parsePrefix( prefix, value ) };
            return { extension : { $elemMatch : { url : "Communication.dissemination", extension : { $elemMatch : { url : "Communication.dissemination.code", valueInstant : parsePrefix( prefix, value ) } } } } };
            break;
        case 'dissemination.location' :
            //return {"dissemination.location" : parsePrefix( prefix, value ) };
            return { extension : { $elemMatch : { url : "Communication.dissemination", extension : { $elemMatch : { url : "Communication.dissemination.location", valueReference : parsePrefix( prefix, value ) } } } } };
            break;
        case 'dissemination.recipient' :
            //return {"dissemination.recipient.reference" : parsePrefix( prefix, value ) };
            if ( prefix == 'eq' ) {
                var parsed = parseReference( "valueReference", value );
                parsed[url] = "Communication.dissemination.recipient";
                return { extension : { $elemMatch : { url : "Communication.dissemination", extension : { $elemMatch : parsed } } } };
            } else {
                console.log("Don't know how to handle reference search other than eq for dissemination.recipient");
                return { extension : { $elemMatch : { url : "Communication.dissemination", extension : { $elemMatch : { url : "Communication.dissemination.recipient", valueReference : parsePrefix( prefix, value ) } } } } };
            }
            break;


            // { $or : [ { "recipient.reference" : { $regex : /Patient\/23$/ } }, { "recipient.contained.resourceType" : "Patient", "recipient.contained.id" : "23" }  ] }

    }
}

function parseReference( field, value ) {
    var values = value.split('/');
    var parsed = {};
    if ( values.length == 2 ) {
        var search_reg = values[0] + "\/" + values[1];
        var first = {};
        first[field+".reference"] = { $regex : search_reg };
        var second = {};
        second[field+".contained.resourceType"] = values[0];
        second[field+".contained.id"] = values[1];
        parsed['$or'] = [ first, second ];
    } else {
        parsed[field] = parsePrefix( 'eq', value );
    }
    return parsed;
}

function parsePrefix( prefix, value ) {
    switch( prefix ) {
        case 'eq' :
            return value;
            break;
        case 'ne' :
            return { $ne: value };
            break;
        case 'gt' :
            return { $gt: value };
            break;
        case 'lt' :
            return { $lt: value };
            break;
        case 'ge' :
            return { $gte: value };
            break;
        case 'le' :
            return { $lte: value };
            break;
        case 'sa' :
            return { $gt: value };
            break;
        case 'eb' :
            return { $lt: value };
            break;
        case 'ap' :
            console.log("Currently not supporting ap search prefix, using eq.");
            return value;
            break;
    }
}

function processPlugins( type, resource ) {

    for( i in plugins ) {
        plugins[i].process( type, nconf, db, mongo, resource, function( new_resource ) {
            if ( new_resource ) {
                internalUpdate( new_resource );
            }
        });
    }
}


function convertFormat( type, data, callback ) {

    try {
        var child = spawn('java', [ '-classpath', 
                './java:./java/hapi-fhir-base-1.3.jar:./java/slf4j-api-1.7.12.jar:./java/hapi-fhir-structures-dstu2-1.3.jar:./java/commons-lang3-3.4.jar:./java/javax.json-1.0.4.jar:./java/logback-classic-1.1.3.jar:./java/logback-core-1.1.3.jar:./java/woodstox-core-asl-4.4.1.jar:./java/stax2-api-3.1.4.jar',
                'FhirXmlJson', type], { stdio: 'pipe' } );

        child.stdin.write(data);
        child.stdin.end();

        child.stderr.on('data', function( chunk ) {
            // Ignore the stderr for now because there is a lot of output.  Can display it if there is an issue to track down.
        });

        var resourceOutput = "";
        child.stdout.on('data', function( chunk ) {
            resourceOutput += chunk;
        });

        child.on('close', function( code ) {
            //console.log("child exited with code "+code);
            callback( null, resourceOutput );
        });
    } catch( err ) {
        callback( err );
    }

}
