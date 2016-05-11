var express = require('express');
var nconf = require("nconf");
var hh = require('http-https')
var bodyParser = require('body-parser');
var convert = require('./convert');
var uuidlib = require('uuid');
var async = require("async");

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


try {
    var app = express();
    app.use(bodyParser.json( { type : "application/json" } ));
    app.use(bodyParser.json( { type : "application/json+fhir" } ));
    app.use(bodyParser.text( { type : "application/xml" } ));
    app.use(bodyParser.text( { type : "application/xml+fhir" } ));
    app.use(bodyParser.urlencoded({ extended: false }));

    var lport = nconf.get('rpq:port');
    app.listen(lport);
    console.log('listening on port ' + lport);



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
	var processQuestionnaires  = function(questionnaires) {
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
	}
	getQuestionnaires(nconf,url,false,processQuestionnaires);
    });    

    app.get("/fhir/Questionnaire/:fhir_id", function( req, res ) {
	var url = getHostURL(nconf,req) ;
	var uuid = req.params.fhir_id;
	var processQuestionnaires = function(questionnaires) {

	    console.log("found:"+JSON.stringify(questionnaires,null,"\t"));

	    if ( Object.keys(questionnaires).length == 0 ) {
		res.status(500);
		res.json( errorOutcome( ERR_SEARCH, 'information', 'No questionnaire found with uuid ' + req.params.fhir_id));
		res.end();
	    } else if ( Object.keys(questionnaires).length >1  ) {
		res.status(500);
		res.json( errorOutcome( ERR_SEARCH, 'information', 'Too many questionnaires found with uuid ' + req.params.fhir_id));
		res.end();
	    } else {
		res.status(200);
		res.type("application/json+fhir");
		res.json(questionnaires[0]);
		res.end();
	    }
	}
	getQuestionnaires(nconf,url,uuid,processQuestionnaires);
	
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
        id : uuidlib.v4(),
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


function getQuestionnaires(nconf,url,uuid,callback) {
    var questionnaires= [];    
    if (!callback) {
	callback = function(questionnaires) {return questionnaires;};
    }

    var rurl = 'http(s)://' + nconf.get('rapidpro:host') + ':'  + nconf.get('rapidpro:port') + "/api/v1/flows.json";
    console.log('Making request ' + rurl);
    var req = hh.request( 
	{
            hostname : nconf.get("rapidpro:host"),
            port : nconf.get("rapidpro:port"),
	    protocol: nconf.get('rapidpro:protocol'),
            path :  "/api/v1/flows.json" ,
            headers : {
		'Content-Type': "application/json",
		'Authorization' : nconf.get("rapidpro:token"),
            },
            method : 'GET' 
	},
	function( res ) {
            //console.log("RapidPro Status: " +res.statusCode );
            res.on('error', function(e) {
                console.log("RapidPro error: " +e.message);
		callback([]);
            });
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                //console.log("RapidPro response: "+body);
                try {
		    var details = JSON.parse( body );
		    if (!details.results || ! Array.isArray(details.results)) {
			console.log("no flow results ");
			callback([]);
			return;
		    }		    
		    var tasks = [];
		    details.results.forEach( function(result) {
			if (uuid && result.uuid != uuid) {
			    return;
			}

			tasks.push( 
			    function(callback) {
				var createQ  = function(flow) {
				    console.log('createQ' + JSON.stringify(flow,null,"\t"));
				    if (flow) {
					questionnaires.push(createQuestionnaireFromFlow(url,result,flow));
				    }
				    callback();
				};
				
				getFlowExport(result.uuid,createQ); 
			    });
		    });
		    async.parallel(tasks,function() {console.log('ok'); callback(questionnaires);});
		    //console.log("Filtering" + JSON.stringify(questionnaires));
		    //callback(questionnaires);
                } catch ( err ) {
                    console.log("Failed to parse rapid pro response." + body);
                    console.log(err);
		    callback([]);
                }
            });
        });
    req.on('error', function( req_err ) {
        console.log("Got error on request to rapidpro");
        console.log(req_err);
	callback([]);
    });
    req.end();
}




function createQuestionnaireFromFlow(url,result,flow) {
    var questions = [];
    console.log("RESULT:" + JSON.stringify(flow,null,"\t"));
    if (flow.rule_sets  && Array.isArray(flow.rule_sets)) {			    
	flow.rule_sets.forEach(function(ruleset) {
	    if (!ruleset.rules || ! Array.isArray(ruleset.rules)) {
		return;
	    }			
	    var options = [];
	    console.log('processing ' + ruleset.ruleset_type);
	    switch (ruleset.ruleset_type) {
	    case 'wait_recording': //ivr recording
		break;
	    case 'wait_digit':	//ivr choice
		var type = 'choice';
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
			    'valueString' : val
			}
			if (rule.test.test != 'true') {
			    option['valueInteger']  =  rule.test.test;
			}

			options.push(option);
		    }
		});
		var question = {
		    'linkId': ruleset.uuid  + '.' + type,
		    'type': 'choice',
		    'options': options,
		    'text': ruleset.label + ' (' + type +  ')'
		}
		questions.push(question);				    
		break;
	    case 'wait_digits':	//ivr multi-digit response
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
		    case 'number':
			types.push('integer');
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
			types.push('integer');
			break;
		    default:
			break;
		    };
		});
		break;
	    case 'wait_message':	//sms response
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
			console.log(rule.category);
			console.log(Object.keys(rule.category)[0]);
			if (rule.category) {
			    val = rule.category[Object.keys(rule.category)[0]];
			}
			console.log(val);
			if (! (val === false)) {
			    var option = {
				'valueString' : val
			    }
			    options.push(option);
			}
			types.push('string');
			break;
		    default:
			break;
		    }
		});
		utypes = types.filter(function(e,p) {return types.indexOf(e) == p;});
		utypes.forEach(function(type) {
		    var question = {
			'linkId': ruleset.uuid  + '.' + type,
			'type': type,
			'text': ruleset.label  + ' (' + type +  ')'
		    }
		    questions.push(question);
		});		    
			       
		if (options.length > 1) {
		    var question = {
			'linkId': ruleset.uuid  + '.choice',
			'type': 'choice',
			'options': options,
			'text': ruleset.label + ' ( choice )'
		    }
		    questions.push(question);
		}
		//now push an question for the raw response
		questions.push({
		    'linkId': ruleset.uuid  + '.raw',
		    'type': 'string',
		    'text': ruleset.label  + ' (Raw Response)'
		});
		break;
	    default:
		break;
	    }
	});
    }
    if (!flow.metadata) {
	flow.metadata = {};
    }
    var questionnaire = {
	'resourceType':'Questionnaire',
	'id': result.uuid ,
	'meta' : {
	    'lastUpdated': flow.metadata.saved_on ,
	    'versionId': flow.metadata.revision
	},
	'date' : flow.metadata.saved_on,
	'url' :  url + '/fhir/Questionnaire/' + result.uuid,
	'status' : result.archived ? 'retired' : 'published' ,
	'group' : {
	    'linkId' : 'root',
	    'title': result.name,
	    'question' : questions

	}

    };
    console.log("QUESITONNAIRE:" + JSON.stringify(questionnaire,null,"\t"));
    return questionnaire;
}


    
function getFlowExport(uuid,callback) {
    console.log('gfe');
    var result = {};
    //console.log('Getting flow ' + uuid);
    var params = '?uuid=' + uuid;
    var req = hh.request( 
	{
            hostname : nconf.get("rapidpro:host"),
            port : nconf.get("rapidpro:port"),
	    protocol: nconf.get('rapidpro:protocol'),
            path :  "/api/v1/flow_definition.json" + params,
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
                try {
		    result = JSON.parse( body );
		    console.log("FLOW DEFINITION :"+JSON.stringify(result,null,"\t"));
		} catch (e) {
                    console.log("RapidPro error: " +e.message);
		    callback(false);
		    return;
		}
		if (!result.rule_sets || !Array.isArray(result.rule_sets) ) {
		    console.log("no FLOW DEFINITION" + result.rule_sets.length);
		    callback(false);
		    return;
		}
		console.log('got flow');
		callback(result);
	    });
            res.on('error', function(e) {
                console.log("RapidPro error: " +e.message);
		callback(false);
            });
	});
    req.on('error', function( req_err ) {
	console.log("Got error on request to rapidpro");
	console.log(req_err);
	callback(false);
    });
    req.end();
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


