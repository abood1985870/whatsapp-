import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { generateCorrelationId } from "@qanoai/shared";

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    request.correlationId = request.headers["x-correlation-id"] || generateCorrelationId();
    return next.handle();
  }
}
