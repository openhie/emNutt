import java.io.PrintStream;
import java.io.OutputStream;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.model.dstu2.resource.Communication;
import ca.uhn.fhir.parser.IParser;

public class FhirXmlJson {
    public static void main(String[] theArgs) {
        
        String resourceBody = "";

        try {
            BufferedReader br = new BufferedReader( new InputStreamReader( System.in ) );

            String input;

            while( (input = br.readLine()) != null ) {
                resourceBody += input;
            }
        } catch( IOException io ) {
            io.printStackTrace();
        }
        
        PrintStream orig = System.out;
        /*
        System.setOut(new PrintStream( new OutputStream() {
            public void write(int b) {
            }
        }));
        */
        System.setOut(System.err);
        // Create a context
        FhirContext ctx = FhirContext.forDstu2();

        // Create a XML parser
        IParser xmlParser = ctx.newXmlParser();
        // Create a JSON parser
        IParser jsonParser = ctx.newJsonParser();

        String encode;
        Communication comm;
        String start = "json";

        if ( theArgs.length >= 1 ) {
            start = theArgs[0];
        }
        System.out.println("Start is "+start+" "+theArgs.length);
        if ( start.equals( "xml" ) ) {
            comm = xmlParser.parseResource(Communication.class, resourceBody );
            jsonParser.setPrettyPrint(true);
            encode = jsonParser.encodeResourceToString(comm);
        } else {
            comm = jsonParser.parseResource(Communication.class, resourceBody );
            xmlParser.setPrettyPrint(true);
            encode = xmlParser.encodeResourceToString(comm);
        }

        System.setOut(orig);
        System.out.println(encode);
        
    }
}
