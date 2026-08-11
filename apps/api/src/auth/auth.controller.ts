import { Controller, Post, Body, HttpCode, HttpStatus, Get, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { IsEmail, IsString, IsNotEmpty, IsOptional, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthThrottleGuard } from "./auth-throttle.guard";

class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10, { message: "كلمة المرور لازم تكون ١٠ أحرف على الأقل" })
  password: string;

  @IsString()
  @IsNotEmpty()
  organizationName: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(10, { message: "كلمة المرور لازم تكون ١٠ أحرف على الأقل" })
  password: string;
}

class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

class LoginMfaDto {
  @IsString()
  @IsNotEmpty()
  mfaToken: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}

class Disable2FaDto {
  @IsString()
  @IsOptional()
  token?: string;

  @IsString()
  @IsOptional()
  password?: string;
}

class Verify2FaDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: "كلمة المرور لازم تكون ١٠ أحرف على الأقل" })
  newPassword: string;
}

class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

@ApiTags("Authentication")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Recorded on the session and on failed-login audit rows. */
  private contextOf(req: any) {
    return { ip: req?.ip, userAgent: req?.headers?.["user-agent"] };
  }

  @Post("register")
  @UseGuards(AuthThrottleGuard)
  @ApiOperation({ summary: "Register new user and organization" })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    // Returns { mfaRequired, mfaToken } when the account has 2FA enabled — the
    // caller must then post to /auth/login/mfa. Password alone is no longer a
    // complete login for those accounts.
    return this.authService.login(dto.email, dto.password, this.contextOf(req));
  }

  @Post("login/mfa")
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete a 2FA login" })
  async loginMfa(@Body() dto: LoginMfaDto, @Req() req: any) {
    return this.authService.loginMfa(dto.mfaToken, dto.code, this.contextOf(req));
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user" })
  async me(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }

  @Post("forgot-password")
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send password reset email" })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset password with token" })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify email with token" })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post("refresh")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh JWT token" })
  async refresh(@CurrentUser() user: any, @Req() req: any) {
    return this.authService.refreshToken(user.id, req.sessionJti, this.contextOf(req));
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Invalidate session" })
  async logout(@CurrentUser() user: any, @Req() req: any) {
    return this.authService.logout(user.id, req.sessionJti);
  }

  @Post("logout-all")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign out of every device" })
  async logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.id);
  }

  @Post("change-password")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change password (authenticated)" })
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post("update-profile")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update profile (name)" })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto.name);
  }

  @Post("2fa/setup")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Setup TOTP 2FA" })
  async setup2Fa(@CurrentUser() user: any) {
    return this.authService.setup2Fa(user.id);
  }

  @Post("2fa/verify")
  @UseGuards(AuthGuard, AuthThrottleGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify TOTP 2FA" })
  async verify2Fa(@CurrentUser() user: any, @Body() dto: Verify2FaDto) {
    return this.authService.verify2Fa(user.id, dto.token);
  }

  @Post("2fa/disable")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Disable TOTP 2FA" })
  async disable2Fa(@CurrentUser() user: any, @Body() dto: Disable2FaDto) {
    // Requires a current TOTP code or the account password.
    return this.authService.disable2Fa(user.id, dto);
  }
}
