import { type Construct } from "constructs";
import { CfnOutput, Stack, type StackProps, aws_ec2 as ec2 } from "aws-cdk-lib";
import { EC2InstanceAccess } from "../constants";
import { EC2Instance } from "../constructs/ec2-instance";

export class GravitonPerformanceTest extends Stack {
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
      instanceName: "graviton-performance-test",
      instanceType: "c7g.xlarge",
      instanceAccess: EC2InstanceAccess.InstanceConnect,
      sshKeyPairName,
      region: this.region,
      userData: [
        // perf
        "sudo yum install perf -y",
        // perl-open; see issue: https://github.com/brendangregg/FlameGraph/issues/245
        "sudo yum install perl-open.noarch -y",
        // Go
        "wget -O /home/ec2-user/go.tar.gz https://go.dev/dl/go1.24.5.linux-arm64.tar.gz",
        "sudo tar -C /usr/local -xzf /home/ec2-user/go.tar.gz",
        "sudo echo 'export PATH=\"$PATH:/usr/local/go/bin\"' | tee -a /home/ec2-user/.bashrc /home/ec2-user/.zshrc",
        "sudo rm /home/ec2-user/go.tar.gz",
        // APerf
        "wget -O /home/ec2-user/aperf.tar.gz https://github.com/aws/aperf/releases/download/v0.1.15-alpha/aperf-v0.1.15-alpha-aarch64.tar.gz",
        "sudo tar -C /home/ec2-user/ -xzf /home/ec2-user/aperf.tar.gz",
        "sudo mv /home/ec2-user/aperf-v0.1.15-alpha-aarch64 /home/ec2-user/aperf",
        "sudo rm /home/ec2-user/aperf.tar.gz",
        // FlameGraph
        "git clone https://github.com/brendangregg/FlameGraph /home/ec2-user/FlameGraph",
        // Example Golang application
        "git clone https://github.com/tchangkiat/go-gin /home/ec2-user/go-gin",
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
