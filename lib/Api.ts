import * as cdk from '@aws-cdk/core';
import { Duration, Fn } from '@aws-cdk/core';
import { HttpApi, HttpMethod, HttpStage } from '@aws-cdk/aws-apigatewayv2';
import { AttributeType, StreamViewType, Table } from '@aws-cdk/aws-dynamodb';
import { LambdaProxyIntegration } from '@aws-cdk/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers';
import { DynamoEventSource, SqsDlq } from '@aws-cdk/aws-lambda-event-sources';
import { Queue } from '@aws-cdk/aws-sqs';
import { StartingPosition } from '@aws-cdk/aws-lambda';
import { HttpOrigin } from '@aws-cdk/aws-cloudfront-origins';
import {
  AllowedMethods,
  BehaviorOptions,
  CacheHeaderBehavior,
  CachePolicy,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  ViewerProtocolPolicy,
} from '@aws-cdk/aws-cloudfront';
import DefaultNodejsFunction from './api/DefaultNodejsFunction';
import { ApiProps } from './interfaces/ApiProps';

export default class Api extends cdk.Construct {
  public additionalBehaviors = new Map<string, BehaviorOptions>();

  constructor(scope: cdk.Construct, id: string, props: ApiProps) {
    super(scope, id);

    const table = new Table(this, 'Table', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING,
      },
      readCapacity: 1,
      writeCapacity: 1,
      timeToLiveAttribute: 'expire',
      stream: StreamViewType.OLD_IMAGE,
    });

    table.addGlobalSecondaryIndex({
      partitionKey: {
        name: 'user',
        type: AttributeType.STRING,
      },
      indexName: 'user-index',
      writeCapacity: 1,
      readCapacity: 1,
    });

    const api = new HttpApi(this, 'Api', {
      createDefaultStage: false,
    });

    new HttpStage(this, 'Stage', {
      httpApi: api,
      autoDeploy: true,
      stageName: 'api',
    });

    const authorizer = new HttpJwtAuthorizer({
      jwtAudience: [props.jwtAudience],
      jwtIssuer: props.jwtIssuerUrl,
    });

    const defaultLambdaEnvironment = {
      TABLE_NAME: table.tableName,
      FILE_BUCKET: props.fileBucket.bucketName,
      DOMAIN: props.domain,
    };

    // Filedeletion
    const deadLetterQueue = new Queue(this, 'deletionDeadLetterQueue');
    const onShareDeletionFunction = new DefaultNodejsFunction(this, 'onShareDeletion', {
      entry: 'lambda/nodejs/src/functions/onShareDeletion/index.ts',
      environment: defaultLambdaEnvironment,
    });
    props.fileBucket.grantDelete(onShareDeletionFunction);
    onShareDeletionFunction.addEventSource(new DynamoEventSource(table, {
      startingPosition: StartingPosition.LATEST,
      onFailure: new SqsDlq(deadLetterQueue),
      bisectBatchOnError: true,
      enabled: true,
    }));

    this.additionalBehaviors.set('/api/*', {
      origin: new HttpOrigin(Fn.select(2, Fn.split('/', api.apiEndpoint))),
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: new CachePolicy(this, 'ApiCachePolicy', {
        minTtl: Duration.seconds(0),
        defaultTtl: Duration.seconds(0),
        maxTtl: Duration.seconds(1),
        headerBehavior: CacheHeaderBehavior.allowList('Authorization'),
      }),
      originRequestPolicy: new OriginRequestPolicy(this, 'ApiOriginRequestPolicy', {
        headerBehavior: OriginRequestHeaderBehavior.none(),
        queryStringBehavior: OriginRequestQueryStringBehavior.all(),
        cookieBehavior: OriginRequestCookieBehavior.none(),
      }),
    });

    this.additionalBehaviors.set('/d/*', {
      origin: new HttpOrigin(Fn.select(2, Fn.split('/', api.apiEndpoint)), {
        originPath: '/api',
      }),
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: new CachePolicy(this, 'LinkCachePolicy', {
        maxTtl: Duration.days(1),
        defaultTtl: Duration.seconds(60),
        minTtl: Duration.seconds(60),
      }),
    });

    // Routes

    const addShareFunction = new DefaultNodejsFunction(this, 'AddShare', {
      entry: 'lambda/nodejs/src/functions/addShare/index.ts',
      environment: defaultLambdaEnvironment,
      timeout: Duration.seconds(15),
    });
    table.grantWriteData(addShareFunction);
    props.fileBucket.grantPut(addShareFunction);

    api.addRoutes({
      path: '/add',
      methods: [HttpMethod.POST],
      integration: new LambdaProxyIntegration({
        handler: addShareFunction,
      }),
      authorizer,
    });

    const completeUploadFunction = new DefaultNodejsFunction(this, 'CompleteUpload', {
      entry: 'lambda/nodejs/src/functions/completeUpload/index.ts',
      environment: defaultLambdaEnvironment,
      timeout: Duration.seconds(15),
    });
    table.grantReadWriteData(completeUploadFunction);
    props.fileBucket.grantPut(completeUploadFunction);

    api.addRoutes({
      path: '/completeUpload/{id}',
      methods: [HttpMethod.POST],
      integration: new LambdaProxyIntegration({
        handler: completeUploadFunction,
      }),
      authorizer,
    });

    const listSharesFunction = new DefaultNodejsFunction(this, 'ListShares', {
      entry: 'lambda/nodejs/src/functions/listShares/index.ts',
      environment: defaultLambdaEnvironment,
    });
    table.grantReadData(listSharesFunction);

    api.addRoutes({
      path: '/list',
      methods: [HttpMethod.GET],
      integration: new LambdaProxyIntegration({
        handler: listSharesFunction,
      }),
      authorizer,
    });

    const deleteShareFunction = new DefaultNodejsFunction(this, 'DeleteShare', {
      entry: 'lambda/nodejs/src/functions/deleteShare/index.ts',
      environment: defaultLambdaEnvironment,
    });
    table.grantWriteData(deleteShareFunction);

    api.addRoutes({
      path: '/share/{id}',
      methods: [HttpMethod.DELETE],
      integration: new LambdaProxyIntegration({
        handler: deleteShareFunction,
      }),
      authorizer,
    });

    const forwardShareFunction = new DefaultNodejsFunction(this, 'ForwardShare', {
      entry: 'lambda/nodejs/src/functions/forwardShare/index.ts',
      environment: {
        ...defaultLambdaEnvironment,
        KEY_ID: props.fileShareKeyId,
        KEY_SECRET: props.fileShareKeySecret.secretName,
      },
    });
    table.grantReadData(forwardShareFunction);
    props.fileShareKeySecret.grantRead(forwardShareFunction);

    api.addRoutes({
      path: '/d/{id}',
      methods: [HttpMethod.GET],
      integration: new LambdaProxyIntegration({
        handler: forwardShareFunction,
      }),
    });
  }
}
