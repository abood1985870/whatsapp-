import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { generateCorrelationId } from "@qanoai/shared";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    const errorResponse = {
      error: {
        code: exceptionResponse.code || `HTTP_${status}`,
        message: exceptionResponse.message || exception.message,
        localizedMessage: exceptionResponse.localizedMessage || exception.message,
        fieldErrors: exceptionResponse.fieldErrors || undefined,
        correlationId: generateCorrelationId(),
      },
    };

    response.status(status).json(errorResponse);
  }
}
