import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, Body, Res } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { FilesService } from "./files.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";

@ApiTags("Files")
@Controller({ path: "files", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("upload")
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.update") // Using a generic permission since files isn't in default seeds
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, organizationId: { type: 'string' } } } })
  async upload(
    @UploadedFile() file: any, 
    @Body() dto: { organizationId: string }
  ) {
    return this.filesService.uploadFile(file, dto.organizationId);
  }

  @Get(":id/download")
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.read")
  async download(@Param("id") id: string, @Res() res: Response) {
    const file = await this.filesService.getFile(id);
    return res.redirect(file.url);
  }

  @Delete(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.update")
  async delete(@Param("id") id: string) {
    return this.filesService.deleteFile(id);
  }
}
