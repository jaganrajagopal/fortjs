import * as http from "http";
import * as url from 'url';
import { Controller, Wall } from "../abstracts";
import { __Cookie } from "../constant";
import { FortGlobal } from "../fort_global";
import { parseCookie, parseAndMatchRoute, promise, compareExpectedAndRemoveUnnecessary, reverseLoop } from "../helpers";
import { CookieManager, FileManager } from "../models";
import { GenericSessionProvider, GenericGuard } from "../generics";
import { RouteMatch, HttpRequest, HttpResponse } from "../types";
import { HTTP_METHOD } from "../enums";
import { PostHandler } from "./post_handler";
import { InjectorHandler } from "./injector_handler";
import { RouteHandler } from "./route_handler";
import { IException } from "../interfaces";
import { promiseResolve } from "../utils";
import { ControllerResultHandler } from "./controller_result_handler";


export class RequestHandler extends ControllerResultHandler {

    private session_: GenericSessionProvider;
    private query_: any;
    private data_ = {};
    private routeMatchInfo_: RouteMatch;
    private wallInstances: Wall[] = [];

    protected body: any;
    protected file: FileManager;

    constructor(request: http.IncomingMessage, response: http.ServerResponse) {
        super();
        this.request = request;
        this.response = response;
        this.registerEvents_();
    }

    private registerEvents_() {
        this.request.on('error', (err) => {
            this.onBadRequest(err).catch(ex => {
                this.onErrorOccured(ex);
            });
        });
        this.response.on('error', this.onErrorOccured.bind(this));
    }

    private executeWallIncoming_(): Promise<boolean> {
        return promise((res, rej) => {
            let index = 0;
            const wallLength = FortGlobal.walls.length;
            const executeWallIncomingByIndex = () => {
                if (wallLength > index) {
                    const wall = FortGlobal.walls[index++];
                    const constructorArgsValues = InjectorHandler.getConstructorValues(wall.name);
                    const wallObj = new wall(...constructorArgsValues);
                    wallObj.cookie = this.cookieManager;
                    wallObj.session = this.session_;
                    wallObj.request = this.request as HttpRequest;
                    wallObj.response = this.response as HttpResponse;
                    wallObj.data = this.data_;
                    wallObj.query = this.query_;

                    this.wallInstances.push(wallObj);
                    const methodArgsValues = InjectorHandler.getMethodValues(wall.name, 'onIncoming');
                    wallObj.onIncoming(...methodArgsValues).then(result => {
                        if (result == null) {
                            executeWallIncomingByIndex();
                        }
                        else {
                            res(false);
                            this.onTerminationFromWall(result);
                        }
                    }).catch(rej);
                }
                else {
                    res(true);
                }
            };
            executeWallIncomingByIndex();
        });
    }

    runController_;

    private executeShieldsProtection_(): Promise<() => void> {
        return promise((res, rej) => {
            let index = 0;
            const shieldLength = this.routeMatchInfo_.shields.length;
            const executeShieldByIndex = () => {
                if (shieldLength > index) {
                    const shield = this.routeMatchInfo_.shields[index++];
                    const constructorArgsValues = InjectorHandler.getConstructorValues(shield.name);
                    const shieldObj = new shield(...constructorArgsValues);
                    shieldObj.cookie = this.cookieManager;
                    shieldObj.query = this.query_;
                    shieldObj.session = this.session_;
                    shieldObj.request = this.request as HttpRequest;
                    shieldObj.response = this.response as HttpResponse;
                    shieldObj.data = this.data_;
                    shieldObj.workerName = this.routeMatchInfo_.workerInfo.workerName;

                    const methodArgsValues = InjectorHandler.getMethodValues(shield.name, 'protect');

                    return shieldObj.protect(...methodArgsValues).then(result => {
                        if (result == null) {
                            executeShieldByIndex();
                        }
                        else {
                            res(this.onResultFromComponent(result));
                        }
                    }).catch(rej);
                }
                else {
                    res(null);
                }
            };
            executeShieldByIndex();
        });
    }

    private executeGuardsCheck_(guards: Array<typeof GenericGuard>): Promise<() => void> {
        return promise((res, rej) => {
            let index = 0;
            const shieldLength = guards.length;
            const executeGuardByIndex = () => {
                if (shieldLength > index) {
                    const guard = guards[index++];
                    const constructorArgsValues = InjectorHandler.getConstructorValues(guard.name);
                    const guardObj = new guard(...constructorArgsValues);
                    guardObj.body = this.body;
                    guardObj.cookie = this.cookieManager;
                    guardObj.query = this.query_;
                    guardObj.session = this.session_;
                    guardObj.request = this.request as HttpRequest;
                    guardObj.response = this.response as HttpResponse;
                    guardObj.data = this.data_;
                    guardObj.file = this.file;
                    guardObj.param = this.routeMatchInfo_.params;

                    const methodArgsValues = InjectorHandler.getMethodValues(guard.name, 'check');
                    guardObj.check(...methodArgsValues).then(result => {
                        if (result == null) {
                            executeGuardByIndex();
                        }
                        else {
                            res(this.onResultFromComponent(result));
                        }
                    }).catch(rej);
                }
                else {
                    res(null);
                }
            };
            executeGuardByIndex();
        });
    }

    private parseCookieFromRequest_() {
        if (FortGlobal.shouldParseCookie === true) {
            const rawCookie = (this.request.headers[__Cookie] || this.request.headers["cookie"]) as string;
            let parsedCookies;
            try {
                parsedCookies = parseCookie(rawCookie);
            } catch (ex) {
                this.onErrorOccured(ex);
                return false;
            }
            const session = new FortGlobal.sessionProvider();
            session.cookie = this.cookieManager = new CookieManager(parsedCookies);
            session.sessionId = parsedCookies[FortGlobal.appSessionIdentifier];
            this.session_ = session;
        }
        else {
            this.cookieManager = new CookieManager({});
        }
        return true;
    }

    private setPreHeader_() {
        this.response.setHeader('X-Powered-By', FortGlobal.appName);
        this.response.setHeader('Vary', 'Accept-Encoding');
        this.response.sendDate = true;
    }

    private checkExpectedQuery_() {
        const expectedQuery = RouteHandler.getExpectedQuery(this.routeMatchInfo_.controllerName, this.routeMatchInfo_.workerInfo.workerName);
        if (expectedQuery != null) {
            this.query_ = compareExpectedAndRemoveUnnecessary(expectedQuery, this.query_, true);
        }
    }

    private checkExpectedBody_() {
        const expectedBody = RouteHandler.getExpectedBody(this.routeMatchInfo_.controllerName, this.routeMatchInfo_.workerInfo.workerName);
        if (expectedBody != null) {
            this.body = compareExpectedAndRemoveUnnecessary(expectedBody, this.body, false);
        }
    }

    private onRouteMatched_() {
        const actionInfo = this.routeMatchInfo_.workerInfo;
        if (actionInfo == null) {
            return () => {
                return this.request.method === HTTP_METHOD.Options ?
                    this.onRequestOptions(this.routeMatchInfo_.allowedHttpMethod) :
                    this.onMethodNotAllowed(this.routeMatchInfo_.allowedHttpMethod);
            }
        }
        else {
            this.checkExpectedQuery_();
            if (this.query_ == null) {
                return this.onBadRequest({
                    message: "Bad query string data - query string data does not match with expected value"
                } as IException);
            }
            return this.executeShieldsProtection_().then(shieldResult => {
                if (shieldResult) return shieldResult;
                return this.handlePostData().catch(ex => {
                    return () => {
                        return this.onBadRequest(ex);
                    }
                })
            }).then(shieldResult => {
                if (shieldResult) return shieldResult;
                this.checkExpectedBody_();
                if (this.body == null) {
                    return () => {
                        this.onBadRequest({
                            message: "Bad body data - body data does not match with expected value"
                        } as IException);
                    }
                }
                return this.executeGuardsCheck_(actionInfo.guards);
            }).then(guardResult => {
                if (guardResult) return guardResult;
                return this.runController_();
            });
        }
    }

    private runWallOutgoing_() {
        const outgoingResults: Array<Promise<any>> = [];
        reverseLoop(this.wallInstances, (value: Wall) => {
            const methodArgsValues = InjectorHandler.getMethodValues(value.constructor.name, 'onOutgoing');
            methodArgsValues.shift();
            outgoingResults.push(value.onOutgoing(this.controllerResult, ...methodArgsValues));
        });
        return Promise.all(outgoingResults);
    }

    private execute_() {
        const urlDetail = url.parse(this.request.url, true);
        this.query_ = urlDetail.query;
        const isCookieValid = this.parseCookieFromRequest_();
        if (isCookieValid === false) return;
        this.executeWallIncoming_().then(isAllowedByWalls => {
            if (isAllowedByWalls === false) return;
            const pathUrl = urlDetail.pathname;
            const requestMethod = this.request.method as HTTP_METHOD;

            this.routeMatchInfo_ = parseAndMatchRoute(pathUrl.toLowerCase(), requestMethod);
            return this.routeMatchInfo_ == null ? () => {
                return this.handleFileRequest(pathUrl);
            } :
                this.onRouteMatched_();
        }).then(finalCallback => {
            if (finalCallback) {
                return this.runWallOutgoing_().then(finalCallback);
            }
        }).catch(ex => {
            this.onErrorOccured(ex);
        })

    }

    handlePostData() {
        if (this.request.method === HTTP_METHOD.Get) {
            this.body = {};
            this.file = new FileManager({});
            return promiseResolve(null);
        }

        if (FortGlobal.shouldParsePost === true) {
            const postHandler = new PostHandler(
                this.request
            );
            return postHandler.parsePostData().then(postResult => {
                this.file = postResult[0];
                this.body = postResult[1];
            });
        }
    }

    handle() {
        this.setPreHeader_();
        this.execute_();
    }

    setControllerProps_() {
        const constructorValues = InjectorHandler.getConstructorValues(this.routeMatchInfo_.controller.name);
        const controllerObj: Controller = new this.routeMatchInfo_.controller(...constructorValues);
        controllerObj.request = this.request as HttpRequest;
        controllerObj.response = this.response;
        controllerObj.query = this.query_;
        controllerObj.body = this.body;
        controllerObj.session = this.session_;
        controllerObj.cookie = this.cookieManager;
        controllerObj.param = this.routeMatchInfo_.params;
        controllerObj.data = this.data_;
        controllerObj.file = this.file;
        const methodArgsValues = InjectorHandler.getMethodValues(this.routeMatchInfo_.controller.name, this.routeMatchInfo_.workerInfo.workerName);
        return controllerObj[this.routeMatchInfo_.workerInfo.workerName](...methodArgsValues);
    }
}
if (FortGlobal.isProduction) {
    RequestHandler.prototype.runController_ = function (this: RequestHandler) {
        return this.setControllerProps_().then(
            this.onResultFromComponent.bind(this)
        );
    };
}
else {
    RequestHandler.prototype.runController_ = function (this: RequestHandler) {
        const result = this.setControllerProps_();
        if (Promise.resolve(result) !== result) {
            return Promise.reject({
                message: "Wrong implementation - worker does not return promise"
            } as IException);
        }
        else {
            return result.then(
                this.onResultFromComponent.bind(this)
            );
        }
    };
}