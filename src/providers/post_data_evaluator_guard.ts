import { Guard } from "../abstracts";
import { HTTP_METHOD, HTTP_STATUS_CODE } from "../enums";
import { JsonHelper, promise, textResult } from "../helpers";
import { FileManager } from "../models";
import { CONTENT_TYPE } from "../constants";
import { MIME_TYPE } from "../enums";
import * as ContentType from "content-type";
import * as QueryString from 'querystring';
import * as Multiparty from "multiparty";
import { MultiPartParseResult } from "../types";
import * as http from "http";

export class PostDataEvaluatorGuard extends Guard {

    async check() {
        try {
            const postResult = await this.handlePostData();
            const componentProps = this['componentProp_'];
            componentProps.file = postResult[0];
            componentProps.body = postResult[1];
        } catch (error) {
            return textResult(error.message || `Invalid body data. Check your data format.`, HTTP_STATUS_CODE.BadRequest);
        }
    }

    async handlePostData() {
        if (this.request.method === HTTP_METHOD.Get) {
            return [new FileManager({}), {}];
        }
        return this.parsePostData();
    }

    private getPostRawData_(): Promise<string> {
        const body = [];
        return promise((res, rej) => {
            (this.request as http.IncomingMessage).on('data', (chunk) => {
                body.push(chunk);
            }).on('end', () => {
                const bodyBuffer = Buffer.concat(body);
                res(bodyBuffer.toString());
            }).on("error", function (err) {
                rej(err);
            });
        });
    }

    private parseMultiPartData_(): Promise<MultiPartParseResult> {
        return promise((res, rej) => {
            new Multiparty.Form().parse(this.request as http.IncomingMessage, (err, fields, files) => {
                if (err) {
                    rej(err);
                }
                else {
                    const result: MultiPartParseResult = {
                        field: {},
                        file: {}
                    };
                    for (const field in fields) {
                        result.field[field] = fields[field].length === 1 ? fields[field][0] : fields[field];
                    }
                    for (const file in files) {
                        result.file[file] = files[file].length === 1 ? files[file][0] : files[file];
                    }
                    res(result);
                }
            });
        });
    }

    async parsePostData() {
        let contentType = this.request.headers[CONTENT_TYPE] || this.request.headers["content-type"];
        if (contentType != null) {
            contentType = ContentType.parse(contentType as string).type;
        }
        if (contentType === MIME_TYPE.FormMultiPart) {
            const multipartyResult = await this.parseMultiPartData_();
            return [new FileManager(multipartyResult.file), multipartyResult.field];
        }
        else {
            let postData;
            const bodyDataAsString = await this.getPostRawData_();
            switch (contentType) {
                case MIME_TYPE.Json:
                    postData = JsonHelper.parse(bodyDataAsString);
                    break;
                case MIME_TYPE.Text:
                case MIME_TYPE.Html:
                    postData = bodyDataAsString; break;
                case MIME_TYPE.FormUrlEncoded:
                    postData = QueryString.parse(bodyDataAsString); break;
                case MIME_TYPE.Xml:
                    postData = new (this['componentProp_'].global as any).xmlParser().parse(bodyDataAsString);
                    break;
                default:
                    postData = {};
            }
            return [new FileManager({}), postData];
        }
    }
}