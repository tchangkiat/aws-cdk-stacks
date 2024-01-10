import { type Construct } from 'constructs'
import {
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_rds as rds,
  Duration
} from 'aws-cdk-lib'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'

export class PostgresDatabase extends Stack {
  public Database: rds.DatabaseInstance

  constructor (scope: Construct, id: string, vpc: ec2.Vpc, props?: StackProps) {
    super(scope, id, props)

    // Security group for database
    const securityGroup = new ec2.SecurityGroup(this, 'database-sg', {
      vpc,
      description: 'Allow connection to RDS PostgreSQL Database Instance',
      allowAllOutbound: true,
      disableInlineRules: true,
      securityGroupName: id
    })
    // This will add the rule as an external cloud formation construct
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow connection to RDS PostgreSQL Database Instance'
    )

    // Creates the database. Engine version must be supported by DMS version
    this.Database = new rds.DatabaseInstance(this, 'database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_5
      }),
      // Generate the secret with admin username `postgres` and random password
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: id
      }),
      allocatedStorage: 50,
      backupRetention: Duration.days(0),
      caCertificate: rds.CaCertificate.RDS_CA_RDS2048_G1,
      cloudwatchLogsRetention: RetentionDays.ONE_DAY,
      deleteAutomatedBackups: true,
      instanceIdentifier: id,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MEDIUM
      ),
      securityGroups: [securityGroup],
      storageType: rds.StorageType.GP3,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      vpc
    })
  }
}
