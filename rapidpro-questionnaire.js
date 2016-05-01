var express = require('express');
var nconf = require("nconf");
var hh = require('http-https')
var bodyParser = require('body-parser');
var convert = require('./convert');
var uuid = require('uuid');

nconf.argv().file("config.json");
nconf.defaults( { 
    "rpq" : { 
        "port" : 3001,
	'host' : 'locahost',
	'protocol' : 'http'
    },
    'rapidpro' : {
	'host' : 'localhost',
	'port' : '80',
	'protocol' : 'https:',
	'token' : false
    }
} );

/*
 * config.json options:
 * "rqp" : {
 *   "host" : "localhost"  ,
 *   "port" : '3001',
 *   "protocol" : 'http'
 *  },
 * "rapidpro": {
 *     "host" : "host",
 *     "port" : "80",
 *     "protocol" : 'https:'
 *     "token" : "Token XXXXXXXXXXXXXX",  // authorization token
 * },
 */

const ERR_RETRIEVE = 101;
const ERR_NOTFOUND = 102;
const ERR_HEADER = 103;
const ERR_CONTENT_TYPE = 104;
const ERR_RESOURCE_TYPE = 105;

const ERR_CONVERT_XML = 201;
const ERR_CONVERT_JSON = 202;
const ERR_VALIDATE_XML = 203;
const ERR_VALIDATE_JSON = 204;
const ERR_VALIDATE_ID = 205;

const ERR_DB_FAIL = 301;

const ERR_SEARCH = 401;

var error_messages = {};
error_messages[ERR_RETRIEVE] = "Error retrieving database resource.";
error_messages[ERR_NOTFOUND] = "Resource not found.";
error_messages[ERR_CONVERT_XML] = "Failed to convert resource to XML.";
error_messages[ERR_CONVERT_JSON] = "Failed to convert resource to JSON.";
error_messages[ERR_HEADER] = "Header option missing or not supported.";
error_messages[ERR_VALIDATE_XML] = "XML Resource isn't valid.";
error_messages[ERR_VALIDATE_JSON] = "JSON Resource isn't valid.";
error_messages[ERR_CONTENT_TYPE] = "Invalid Content-Type header.";
error_messages[ERR_RESOURCE_TYPE] = "Invalid ResourceType in resource.";
error_messages[ERR_VALIDATE_ID] = "Invalid Resource ID.";
error_messages[ERR_DB_FAIL] = "Database error.";
error_messages[ERR_SEARCH] = "Search query error.";



var app = express();

try {
    app.use(bodyParser.json( { type : "application/json" } ));
    app.use(bodyParser.json( { type : "application/json+fhir" } ));
    app.use(bodyParser.text( { type : "application/xml" } ));
    app.use(bodyParser.text( { type : "application/xml+fhir" } ));
    app.use(bodyParser.urlencoded({ extended: false }));

    var lport = nconf.get('rpq:port');
    app.listen(lport);
    console.log('listening on port ' + lport);


    app.get("/fhir/Questionnaire/:fhir_id", function( req, res ) {
	var url = getHostURL(nconf,req) ;
	var questionnaires = getQuestionnaires(nconf,url);
	var filter = function(questionnaire,i) { return testSearchValue(prefix, questionnaire.id, req.params.fhir_id);}
	var questionnaire = questionnaires.filter(filter);
	console.log("found:"+JSON.stringify(questionnaire),null,"\t");
	console.log("found:"+ questionnaires.length);
	if ( Object.keys(questionnaire).length == 0 ) {
            res.status(500);
            res.json( errorOutcome( ERR_SEARCH, 'information', 'No questionnaire found with uuid ' + req.params.fhir_id));
	    res.end();
	} else if ( Object.keys(questionnaire).length >1  ) {
            res.status(500);
            res.json( errorOutcome( ERR_SEARCH, 'information', 'Too many questionnaires found with uuid ' + req.params.fhir_id));
            res.end();
	} else {
	    res.status(200);
	    res.type("application/json+fhir");
            res.json(questionnaire[0]);
            res.end();
	}

    });

    app.post("/fhir/Questionnaire/_search", function( req, res ) {
	var url = getHostURL(nconf,req) ;
	var query = req.query;
	var post = req.body;
	var filters= [];
	if ( query ) {
            for( i in query ) {
		filters.push( parseSearch( i, query[i] ));
            }
	}
	if ( post ) {
            for( i in post ) {
		filters.push( parseSearch( i, post[i] ));
            }
	}
	var questionnaires = getQuestionnaires(nconf,url);
	filters.forEach(function(filter)  {
	    questionnaires = questionnaires.filter(filter);
	});	
	res.status(200);
	res.type("application/json+fhir");
        var bundle = { 
	    resourceType : 'Bundle',
	    type : 'searchset',
	    entry : questionnaires
	}
        res.json(bundle);
    });

} catch (e) {
    console.log("RapidPro Questionnaire error: " +e.message);
}


function errorOutcome( code, severity, diagnostics ) {
    var message = error_messages[code];
    console.log( "Error "+code+": "+message );
    console.log( diagnostics );
    if ( diagnostics instanceof Error ) {
        diagnostics = diagnostics.message;
    }
    return {
        resourceType : "OperationOutcome",
        id : uuid.v4(),
        meta : {
            versionId : 1,
            lastUpdated : new Date()
        },
        text : message,
        issue : [ 
        {
            severity : severity,
            code : code,
            diagnostics : diagnostics
        }
            ]
    };
}
 
function getHostURL(nconf,req) {
    var url = ''
    if (req) {
	url = req.protocol + '://' + req.get('host') ;
    }
    var ptcl = nconf.get('app:protocol');
    if (!ptcl) {
	ptcl = 'https:';
    }
    var host = nconf.get('app:host');
    var port = nconf.get('app:port');
    if (host ) {
	url = ptcl + '//' + host;
	if (port) {
	    url += ':' + port;
	}
    }
    return url;
}


function getQuestionnaires(nconf,url,id) {
    var questionnaires= [];    
    var params = "";
    if (id) {
	params += '?flow=' + id
    }
    var rurl = 'http(s)://' + nconf.get('rapidpro:host') + ':'  + nconf.get('rapidpro:port') + "/api/v1/flows.json" + params;
    console.log('Making request ' + rurl);
    var req = hh.request( 
	{
            hostname : nconf.get("rapidpro:host"),
            port : nconf.get("rapidpro:port"),
	    protocol: nconf.get('rapidpro:protocol'),
            path :  "/api/v1/flows.json" + params,
            headers : {
		'Content-Type': "application/json",
		'Authorization' : nconf.get("rapidpro:token"),
            },
            method : 'GET' 
	},
	function( res ) {
            console.log("RapidPro Status: " +res.statusCode );
            res.on('error', function(e) {
                console.log("RapidPro error: " +e.message);
            });
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                console.log("RapidPro response: "+body);
                try {
		    var details = JSON.parse( body );
		    if (!details.results ||
			! Array.isArray(details.results)
			) {
			console.log("no flow results ");
			return;
		    }
		    details.results.forEach( function(result) {
			var flow = getFlowExport(result.flow);
			var questions = [];
			if (flow.rule_sets  && Array.isArray(flow.rule_sets)) {			    
			    flow.rulesets.forEach(function(ruleset) {
				if (!ruleset.rules || ! Array.isArray(ruleset.rules)) {
				    return;
				}				
				switch (ruleset.ruleset_type) {
				case 'wait_recording': //ivr recording
				    break;
				case 'wait_digit':	//ivr choice
				    var type = 'choice';
				    var options = [];
				    ruleset.rules.forEach(function(rule) {
					if (!rule.test ||  !rule.test.type == 'eq') { 
					    return;
					}
					var val = false;
					if (rule.category) {
					    val = rule.category[Object.keys(rule.category)[0]];
					}
					if (! (val === false)) {
					    var option = {
						'valueInteger' : rule.test.test,
						'valueString' : val
					    }
					    options.push(option);
					}
				    });

				    var question = {
					'linkId': rule.uuid  + '.' + type,
					'type': 'choice',
					'options': options,
					'text': ruleset.label + ' (' + type + '/'+ rule.test.type + ')'
				    }
				    questions.push(question);				    
				    break;
				case 'wait_digits':	//ivr multi-digit response
				case 'wait_message':	//sms response
				    var options = [];
				    var types = ['string'];
				    ruleset.rules.forEach(function(rule) {
					if (!rule.test) {
					    return;
					}
					var type= false;
					switch (rule.test.type) {
					case 'phone': 
					case 'true': //this seems to be just a text string					    
					    types.push('string');
					    break;
					case 'not_empty': 
					case 'contains_any': 
					case 'contains': 
					case 'starts': 
					case 'regex': 
					    var val = false;
					    if (rule.category) {
						val = rule.category[Object.keys(rule.category)[0]];
					    }
					    if (! (val === false)) {
						var option = {
						    'valueString' : val
						}
						options.push(option);
					    }
					    types.push('string');
					    break;
					case 'ward': 
					case 'district': 
					    // SHOULD HAVE VALUESETS ?
					    break;
					case 'date':
					    types.push('date');
					    break;
					case 'date_equal':
					case 'date_before':
					case 'date_after':
					    var val = false;
					    if (rule.category) {
						val = rule.category[Object.keys(rule.category)[0]];
					    }
					    if (! (val === false)) {
						var option = {
						    'valueString' : val
						}
						options.push(option);
					    }
					    types.push('date');
					    break;
					case 'number':
					    types.push('decimal');//could also be an integer
					    break;
					case 'gt':
					case 'eq':
					case 'lt':
					case 'between':
					    var val = false;
					    if (rule.category) {
						val = rule.category[Object.keys(rule.category)[0]];
					    }
					    if (! (val === false)) {
						var option = {
						    'valueString' : val
						}
						options.push(option);
					    }
					    types.push('decimal');//could also be an integer
					    break;
					default:
					    break;
					}
				    });
				    
				    utypes = types.filter(function(e,p) {return types.indexOf(e) == p;});
				    utypes.forEach(function(type) {
					var question = {
					    'linkId': rule.uuid  + '.' + type,
					    'type': type,
					    'text': ruleset.label  + ' (' + type +  ')'
					}
					questions.push(question);
				    });
				    //now push an question for the raw response
				    questions.push({
					'linkId': rule.uuid  + '.raw',
					'type': 'string',
					'text': ruleset.label  + ' (Raw Response)'
				    });
				    break;
				default:
				    break;
				}
			    });
			}
			console.log("FLOW:" + JSON.stringify(flow,null,"\t"));
			if (!flow.metadata) {
			    flow.metadata = {};
			}
			var questionnaire = {
			    'resourceType':'Questionnaire',
			    'id': flow.uuid,
			    'meta' : {
				'lastUpdated': flow.metadata.saved_on ,
				'versionId': flow.metadata.revision
			    },
			    'date' : flow.metadata.saved_on,
			    //result.created_on ,
			    'url' :  url + '/fhir/Questionnaire/' + flow.uuid,
			    'status' : result.archived ? 'retired' : 'published' ,
			    'group' : {
				'linkId' : 'root',
				'title': result.name,
				'question' : questions

			    }

			};
			questionnaires.push(questionnaire);
		    });
                } catch ( err ) {
                    console.log("Failed to parse rapid pro response.");
                    console.log(err);
                }
            });
        });
    req.on('error', function( req_err ) {
        console.log("Got error on request to rapidpro");
        console.log(req_err);
    });
    req.end();

    return questionnaires; //not really
}



function getFlowExport(id) {
    var flow = {};
    var result = {};
    console.log('Getting flow ' + id);
    var req = hh.request( 
	{
            hostname : nconf.get("rapidpro:host"),
            port : nconf.get("rapidpro:port"),
	    protocol: nconf.get('rapidpro:protocol'),
            path : "/flow/export/" + id + '/',
            headers : {
		'Content-Type': "application/json",
		'Authorization' : nconf.get("rapidpro:token"),
            },
            method : 'GET' 
	},
	function( res ) {
            console.log("RapidPro Status: " +res.statusCode );
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                console.log("RapidPro response: "+body);
                try {
		    resul = JSON.parse( body );
		} catch (e) {
                    console.log("RapidPro error: " +e.message);
		}
	    });
            res.on('error', function(e) {
                console.log("RapidPro error: " +e.message);
            });
	});
    req.on('error', function( req_err ) {
    console.log("Got error on request to rapidpro");
    console.log(req_err);
    });
    req.end();
    if (result.flows && Array.isArray(result.flows) && result.flows.length == 1) {
	flow = result.flows[0];
    }
    return flow;
}


function parseSearch( key, value ) {
    var nullfunc = function (e,p) {return true;} //don't filter anything
    try {
	var prefix = value.substring(0,2);
	var prefixes = [ 'eq', 'ne', 'gt', 'lt', 'ge', 'le', 'sa', 'eb', 'ap' ];
	if ( prefixes.indexOf( prefix ) != -1 ) {
            value = value.substring(2);
	} else {
            prefix = 'eq';
	}
	switch( key ) {
	case '_id' :
	    return function(questionnaire,i) {
		return testSearchValue(prefix, questionnaire.id, value);
	    };
            break;
	case '_lastUpdated' : 
	    return function(questionnaire,i) {
		return testSearchValue(prefix, new Date(questionnaire.meta.lastUpdated), new Date(value));
	    };
            break;
	case 'date' : 
	    return function(questionnaire,i) {
		return testSearchValue(prefix, new Date(questionnaire.date), new Date(value));
	    };
            break;
	case 'status' : 
	    return function(questionnaire,i) {
		return testSearchValue(prefix, questionnaire.status, value);
	    };
            break;
	case 'title' : 
	    return function(questionnaire,i) {
		return testSearchValue(prefix, questionnaire.group.title, value);
	    };
            break;
	case 'version' : 
	    return function(questionnaire,i) {
		return testSearchValue(prefix, questionnaire.meta.version, value);
	    };
            break;
	default:
	    return nullfunc;
	    break;
	}
    } catch (e) {
	return nullfunc;
    }
}

function testSearchValue( prefix, v1,v2) {
    switch( prefix ) {
    case 'eq' :
        return (v1 == v2);
        break;
    case 'ne' :
        return  (! (v1 == v2));
        break;
    case 'gt' :
        return ( v1 > v2 );
        break;
    case 'lt' :
        return (v1 < v2 );
        break;
    case 'ge' :
        return ( v1 >= v2);
        break;
    case 'le' :
        return (v1 <= v2);
        break;
    case 'sa' :
        return (v1 > v2);
        break;
    case 'eb' :
        return (v1 < v2);
        break;
    case 'ap' :
        console.log("Currently not supporting ap search prefix, using eq.");
        return (v1 == v2);
        break;
    default:
	return true;
	break;
    }
}
