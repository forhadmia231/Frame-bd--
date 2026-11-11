import {streamingRouter} from '@/modules/streaming/router';
async function route(request:Request,context:{params:Promise<{path:string[]}>}){return streamingRouter(request,(await context.params).path);}
export {route as GET,route as POST,route as PUT,route as DELETE};
