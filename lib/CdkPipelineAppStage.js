const cdk = require("aws-cdk-lib");
const { VPC } = require("../lib/Vpc");

class CdkPipelineAppStage extends cdk.Stage {
  constructor(scope, id, props) {
    super(scope, id, props);

    const vpcStack = new VPC(this, "vpc");
  }
}

module.exports = { CdkPipelineAppStage };
