import { type Construct } from "constructs";
import { CfnOutput, Stack, type StackProps, aws_ec2 as ec2 } from "aws-cdk-lib";
import { EC2InstanceAccess, EC2InstanceOS } from "../constants";
import { EC2Instance } from "../constructs/ec2-instance";

export class GravitonVLLM extends Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    sshKeyPairName: string,
    props?: StackProps,
  ) {
    super(scope, id, props);

    const gravitonInstance = new EC2Instance(this, "graviton-instance", {
      vpc,
      instanceName: "graviton-vllm",
      instanceType: "c8g.8xlarge",
      instanceAccess: EC2InstanceAccess.InstanceConnect,
      sshKeyPairName,
      region: this.region,
      os: EC2InstanceOS.Ubuntu,
      userData: [
        "curl -o /home/ubuntu/setup-gvt-vllm.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/setup-gvt-vllm.sh",
      ],
    }) as ec2.Instance;

    new CfnOutput(this, "Instance Connect URL", {
      value:
        "https://" +
        this.region +
        ".console.aws.amazon.com/ec2/v2/home?region=" +
        this.region +
        "#ConnectToInstance:instanceId=" +
        gravitonInstance.instanceId,
    });
  }
}
