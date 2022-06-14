const { Stack } = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");

class LambdaApiGateway extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const handler = new lambda.Function(this, "lambdaFunction", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline(`
        exports.handler = async function(event, context) {
            try {
                var method = event.httpMethod;
            
                if (method === "GET") {
                    if (event.path === "/") {
                        return {
                            statusCode: 200,
                            headers: {},
                            body: JSON.stringify('{ "From": "Lambda" }')
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

    const api = new apigateway.RestApi(this, "apiGateway", {
      restApiName: "Sample Service",
      description: "Sample Service",
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(handler, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    api.root.addMethod("GET", lambdaIntegration);
  }
}

module.exports = { LambdaApiGateway };
