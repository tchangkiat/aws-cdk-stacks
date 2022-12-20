const { Stack } = require("aws-cdk-lib");
const { StandardVpc } = require("../constructs/Network");

class Vpc extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    this.vpc = new StandardVpc(this, "vpc");
  }
}

module.exports = { Vpc };
