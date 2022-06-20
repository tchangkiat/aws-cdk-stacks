const cdk = require("aws-cdk-lib");
const { StandardVpc } = require("./StandardVpc");

class CdkPipelineAppStage extends cdk.Stage {
  constructor(scope, id, props) {
    super(scope, id, props);

    const vpcStack = new StandardVpc(this, "vpc");
  }
}

module.exports = { CdkPipelineAppStage };
