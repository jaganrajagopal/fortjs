import { IHttpResult } from '../interfaces';

export * from './view_engine_data';
export * from './http_request';
export * from './http_response';
export * from './parent_route';
export * from "./session_value";
export * from "../interfaces/worker_info";
export * from "./etag_option";
export * from "./folder_map";
export * from "./multi_part_parse_result";
export * from "./file_result_info";
export * from "./route_match";
export * from './controller_test_data';
export * from './view_read_option';
export * from './http_format_result';

export type ErrorResultMapper = (error: any) => IHttpResult;
