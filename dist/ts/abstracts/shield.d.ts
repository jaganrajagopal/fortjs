import { HttpRequest, HttpResponse, HttpResult } from "../types";
import { CookieManager } from "../models";
import { SessionProvider, Controller } from ".";
import { ShieldTestData } from "../test_helpers";
export declare abstract class Shield implements Controller {
    workerName: string;
    request: HttpRequest;
    response: HttpResponse;
    query: {
        [key: string]: string;
    };
    session: SessionProvider;
    cookie: CookieManager;
    data: {
        [key: string]: any;
    };
    abstract protect(...args: any[]): Promise<HttpResult>;
    constructor(...args: any[]);
    initialize(data?: ShieldTestData): ShieldTestData;
}
