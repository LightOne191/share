import "reflect-metadata";

import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2} from "aws-lambda";
import {DynamoDBClient, GetItemCommand, PutItemCommand} from "@aws-sdk/client-dynamodb";
import {transformAndValidateSync} from "class-transformer-validator";
import moment = require("moment");
import {uploadService} from "../../services/UploadService";
import {FullfillShareRequestDto} from "./FullfillShareRequestDto";

const ddb = new DynamoDBClient({region: process.env.AWS_REGION});

export const handler = async function fullfillShareRequestHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    const id = event.pathParameters?.id;

    if(!id) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'THe provided Id is invalid'
            })
        };
    }

    const getItemCommand = new GetItemCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
            'PK': {
                S: 'SHARE#'+ id
            },
            'SK': {
                S: 'SHARE#'+ id
            },
        }
    });

    try {
        const itemResult = await ddb.send(getItemCommand);

        const share = itemResult.Item;

        if(!share) {
            return {
                statusCode: 404
            };
        }

        const expiration = moment.unix(Number(share.expire.N));

        if(expiration.isBefore(moment()) || share.type.S !== 'FILE_REQUEST') {
            return {
                statusCode: 404
            };
        }

        if(event.requestContext.http.method === "GET") {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    title: share.title.S
                })
            };
        } else {
            const requestDto = transformAndValidateSync(FullfillShareRequestDto, event.body as string, {
                validator: {
                    validationError: {
                        target: false
                    },
                    forbidUnknownValues: true
                }
            }) as FullfillShareRequestDto;

            const uploadInfo = await uploadService.startUpload(Math.ceil(requestDto.fileSize/1024/1024/200), requestDto.fileType);

            const putItemCommand = new PutItemCommand({
                TableName: process.env.TABLE_NAME,
                Item: {
                    ...share,
                    fileName: {
                        S: requestDto.fileName
                    },
                    file: {
                        S: uploadInfo.fileId
                    },
                    uploadId: {
                        S: uploadInfo.uploadId
                    }
                }
            });

            await ddb.send(putItemCommand);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadUrls: uploadInfo.partUrls
                })
            }
        }
    }
    catch (err) {
        //TODO: Differentiate error types

        console.error(err);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Unable to connect to Database'
            })
        };
    }
}