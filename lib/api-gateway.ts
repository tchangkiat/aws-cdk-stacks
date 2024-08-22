import { type Construct } from "constructs";
import { Stack, type StackProps } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";

export class ApiGateway extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		// ----------------------------
		// Lambda
		// ----------------------------

		const sampleApiFunction = new lambda.Function(this, "sampleApiFunction", {
			runtime: lambda.Runtime.NODEJS_20_X,
			code: lambda.Code.fromInline(`
        exports.handler = async function(event, context) {
            try {
                var method = event.httpMethod;
            
                if (method === "GET") {
                    if (event.path === "/") {
                        return {
                            statusCode: 200,
                            headers: {},
                            body: JSON.stringify('{ "message": "If you see this message, you are authorized" }')
                        };
                    }
                }
            
                return {
                    statusCode: 400,
                    headers: {},
                    body: "Only GET '/' is accepted"
                };
            } catch(error) {
                var body = error.stack || JSON.stringify(error, null, 2);
                return {
                    statusCode: 400,
                    headers: {},
                    body: JSON.stringify(body)
                }
            }
        }
      `),
			handler: "index.handler",
		});

		const authenticator = new lambda.Function(this, "authenticator", {
			functionName: id + "-authenticator",
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.PYTHON_3_12,
			code: lambda.Code.fromAsset("lambda_api_gateway.zip"),
			handler: "authenticator.handler",
		});

		const authorizer = new lambda.Function(this, "authorizer", {
			functionName: id + "-authorizer",
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.PYTHON_3_12,
			code: lambda.Code.fromAsset("lambda_api_gateway.zip"),
			handler: "authorizer.handler",
		});

		// ----------------------------
		// API Gateway
		// ----------------------------

		const api = new apigateway.RestApi(this, "restApi", {
			restApiName: "demo",
			description: "API Gateway Demo",
			deployOptions: {
				stageName: "v1",
			},
		});
		const authResource = api.root.addResource("auth");

		const tokenAuthorizer = new apigateway.TokenAuthorizer(
			this,
			"tokenAuthorizer",
			{
				authorizerName: "JWT",
				handler: authorizer,
			},
		);

		const sampleApiFunctionIntegration = new apigateway.LambdaIntegration(
			sampleApiFunction,
		);
		api.root.addMethod("GET", sampleApiFunctionIntegration, {
			authorizer: tokenAuthorizer,
		});

		const authenticatorIntegration = new apigateway.LambdaIntegration(
			authenticator,
		);
		authResource.addMethod("GET", authenticatorIntegration);
	}
}
