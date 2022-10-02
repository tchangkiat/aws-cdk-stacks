const { Stack } = require("aws-cdk-lib");
const { StandardVPC } = require("../constructs/Network");

class VPC extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    this.vpc = new StandardVPC(this, "vpc");
  }
}

module.exports = { VPC };
