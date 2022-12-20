const cdk = require("aws-cdk-lib");
const { Vpc } = require("./Vpc");

class CdkPipelineAppStage extends cdk.Stage {
  constructor(scope, id, props) {
    super(scope, id, props);

    const vpcStack = new Vpc(this, "vpc");
  }
}

module.exports = { CdkPipelineAppStage };
