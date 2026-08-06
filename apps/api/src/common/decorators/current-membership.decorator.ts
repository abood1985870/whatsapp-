import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentMembership = createParamDecorator((data: keyof any | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const membership = request.membership;
  return data ? membership?.[data] : membership;
});
