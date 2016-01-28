var spawn = require('child_process').spawn;

exports.validate = function( type, data, callback ) {
    try {
        var child = spawn('java', [ '-classpath', 
                './java:./java/hapi-fhir-base-1.3.jar:./java/slf4j-api-1.7.12.jar:./java/hapi-fhir-structures-dstu2-1.3.jar:./java/commons-lang3-3.4.jar:./java/javax.json-1.0.4.jar:./java/logback-classic-1.1.3.jar:./java/logback-core-1.1.3.jar:./java/woodstox-core-asl-4.4.1.jar:./java/stax2-api-3.1.4.jar',
                'FhirXmlJson', type], { stdio: 'pipe' } );

        child.stdin.write(data);
        child.stdin.end();

        child.on('close', function( code ) {
            //console.log("child exited with code "+code);
            if ( code == 1 ) {
                callback( false );
            } else if ( code == 0 ) {
                callback( true );
            } else {
                console.log( "Unknown exit code for validation/conversion: "+code);
                callback( false );
            }
        });
    } catch( err ) {
        callback( err );
    }

}

exports.format = function( type, resourceType,  data, callback ) {

    try {
        var child = spawn('java', [ '-classpath', 
                './java:./java/hapi-fhir-base-1.3.jar:./java/slf4j-api-1.7.12.jar:./java/hapi-fhir-structures-dstu2-1.3.jar:./java/commons-lang3-3.4.jar:./java/javax.json-1.0.4.jar:./java/logback-classic-1.1.3.jar:./java/logback-core-1.1.3.jar:./java/woodstox-core-asl-4.4.1.jar:./java/stax2-api-3.1.4.jar',
                'FhirXmlJson', type, resourceType, 1], { stdio: 'pipe' } );

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
            if ( code == 1 ) {
                callback( "Failed to validate." );
            } else if ( code == 0 ) {
                callback( null, resourceOutput );
            } else {
                callback( "Unknown exit code for validation/conversion: "+code);
            }
        });
    } catch( err ) {
        callback( err );
    }

}
