import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";

import { StandardVpc } from "../constructs/network";

export class Vpc extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new StandardVpc(this, "vpc");
  }
}
