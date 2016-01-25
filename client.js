var http = require('http');
var fs = require("fs");
var path = require('path');


switch( process.argv[2] ) {
    case "create" :
        var content_type = getContentType( process.argv[3] );
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication',
            headers : {
                'Content-Type': content_type
            },
            method : 'POST' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    console.log("got: " +body);
                    //var data = JSON.parse(body);
                    //console.log("got: ");
                    //console.log(data);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            });
        fs.readFile(process.argv[3], function( err, postdata ) {
            if ( err ) throw err;
            req.write(postdata);
            req.end();
        });
        break;
    case "update" :
        var content_type = getContentType( process.argv[5] );
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication/'+process.argv[3],
            headers : {
                'Content-Type': content_type,
                'If-Match': process.argv[4]
            },
            method : 'PUT' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    console.log("got: " +body);
                    //var data = JSON.parse(body);
                    //console.log("got: ");
                    //console.log(data);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            });
        fs.readFile(process.argv[5], function( err, postdata ) {
            if ( err ) throw err;
            req.write(postdata);
            req.end();
        });
        break;
    case "read" :
        var type = "json";
        if ( process.argv.length == 5 ) {
            type = process.argv[4];
        }
        var format = '';
        if ( type == "xml" ) {
            format = "?_format="+encodeURIComponent("application/xml+fhir");
        }
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication/'+process.argv[3]+format,
            method : 'GET' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    //var data = JSON.parse(body);
                    console.log("got: ");
                    console.log(body);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            }).end();
        break;
    case "vread" :
        var type = "json";
        if ( process.argv.length == 6 ) {
            type = process.argv[5];
        }
        var format = '';
        if ( type == "xml" ) {
            format = "?_format="+encodeURIComponent("application/xml+fhir");
        }
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication/'+process.argv[3]+'/_history/'+process.argv[4]+format,
            method : 'GET' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    //var data = JSON.parse(body);
                    console.log("got: ");
                    console.log(body);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            }).end();
        break;
    case "search" :
        var type="json";
        if ( process.argv.length == 5 ) {
            type = process.argv[4];
        }
        var format = '';
        if ( type == "xml" ) {
            format = "&_format="+encodeURIComponent("application/xml+fhir");
        }
        var query = '?'+process.argv[3];
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication'+query+format,
            method : 'GET' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    //var data = JSON.parse(body);
                    console.log("got: ");
                    console.log(body);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            }).end();
        break;
    case "searchpost" :
        var type="json";
        if ( process.argv.length == 6 ) {
            type = process.argv[5];
        }
        var format = '';
        if ( type == "xml" ) {
            format = "&_format="+encodeURIComponent("application/xml+fhir");
        }
        var query = '?'+process.argv[3];
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication/_search'+query+format,
            headers : {
                'Content-Type': "application/x-www-form-urlencoded"
            },
            method : 'POST' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    //var data = JSON.parse(body);
                    console.log("got: ");
                    console.log(body);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            });
        if ( process.argv[4] ) {
            req.write(process.argv[4]);
        }
        req.end();
        break;
    case "sent" :
        var req = http.request( {
            hostname : 'localhost',
            port : 3000,
            path : '/Communication/$sent',
            headers : {
                'Content-Type': "application/x-www-form-urlencoded"
            },
            method : 'POST' }, function( res ) {
                console.log("STATUS: " + res.statusCode);
                console.log("HEADERS: " + JSON.stringify(res.headers));
                var body = '';
                res.on('data', function (chunk) {
                    body += chunk;
                });
                res.on('end', function() {
                    //var data = JSON.parse(body);
                    console.log("got: ");
                    console.log(body);
                });
                res.on('error', function(e) {
                    console.log("error: " +e.message);
                });
            });
        if ( process.argv[3] ) {
            req.write(process.argv[3]);
        }
        req.end();
        break;
   

}

function getContentType( filename ) {
    switch( path.extname( filename ) ) {
        case ".xml" :
            return "application/xml+fhir";
            break;
        case ".json" :
            return "application/json+fhir";
            break;
        default :
            return null;
    }
}

/*
var req = http.request( {
    hostname : 'localhost',
    port : 3000,
    path : '/create',
    headers : {
        'Content-Type': 'application/json'
    },
    method : 'POST' }, function( res ) {
        console.log("STATUS: " + res.statusCode);
        console.log("HEADERS: " + JSON.stringify(res.headers));
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function() {
            console.log("got: " +body);
            //var data = JSON.parse(body);
            //console.log("got: ");
            //console.log(data);
        });
        res.on('error', function(e) {
            console.log("error: " +e.message);
        });
    });
var postdata = {name:"Atreyu",dob: new Date(1984,10,31), loves: ["grape"], weight: 450, gender: "m", vampires: 14};
//var postdata = {name:"Falcor",dob: new Date(1039,4,3), loves: ["pineapple"], weight: 1500, gender: "m", vampires: 14000};
req.write(JSON.stringify(postdata));
req.end();
*/

/*
var req = http.request( {
    hostname : 'localhost',
    port : 3000,
    path : '/read/56461ad40b341afff005c4f9',
    method : 'GET' }, function( res ) {
        console.log("STATUS: " + res.statusCode);
        console.log("HEADERS: " + JSON.stringify(res.headers));
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function() {
            var data = JSON.parse(body);
            console.log("got: ");
            console.log(data);
        });
        res.on('error', function(e) {
            console.log("error: " +e.message);
        });
    }).end();
    */


/*
var req = http.request( {
    hostname : 'localhost',
    port : 3000,
    path : '/vread/565387a32ccbf1c92983747a/_history/8',
    method : 'GET' }, function( res ) {
        console.log("STATUS: " + res.statusCode);
        console.log("HEADERS: " + JSON.stringify(res.headers));
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function() {
            console.log(body);
            var data = JSON.parse(body);
            console.log("got: ");
            console.log(data);
        });
        res.on('error', function(e) {
            console.log("error: " +e.message);
        });
    }).end();
 
*/
