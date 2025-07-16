import { Construct } from "constructs";
import { Stack, StackProps, CfnOutput, aws_ec2 as ec2 } from "aws-cdk-lib";
import { EC2Instance } from "../constructs/ec2-instance";
import { EC2InstanceAccess } from "../constants";

export class Jenkins extends Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    sshKeyPairName: string,
    props?: StackProps,
  ) {
    super(scope, id, props);

    const jenkinsInstance = new EC2Instance(this, "jenkins-instance", vpc, {
      instanceName: "jenkins",
      instanceType: "c7g.large",
      instanceAccess: EC2InstanceAccess.SSH,
      sshKeyPairName,
      region: this.region,
      userData: [
        // Jenkins
        "sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo",
        "sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key",
        "sudo yum upgrade",
        // Dependencies
        "sudo yum install java-17-amazon-corretto -y",
        "sudo yum install jenkins -y",
        "sudo systemctl enable jenkins",
        "sudo systemctl start jenkins",
        // AWS CLI
        "curl 'https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip' -o 'awscliv2.zip'",
        "unzip awscliv2.zip",
        "sudo ./aws/install",
        // Git
        "sudo yum install git -y",
      ],
    }) as ec2.Instance;

    new CfnOutput(this, "Jenkins Instance SSH Command", {
      value:
        "ssh -i " +
        sshKeyPairName +
        ".pem ec2-user@" +
        jenkinsInstance.instancePublicIp,
    });

    new CfnOutput(this, "Jenkins Instance Connect URL", {
      value:
        "https://" +
        this.region +
        ".console.aws.amazon.com/ec2/v2/home?region=" +
        this.region +
        "#ConnectToInstance:instanceId=" +
        jenkinsInstance.instanceId,
    });
  }
}
