import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ContactsService } from "./contacts.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Response } from "express";

@ApiTags("Contacts")
@Controller({ path: "contacts", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.read")
  async list(@Query("organizationId") organizationId: string, @Query("search") search?: string) {
    return this.contactsService.findAll(organizationId, search);
  }

  @Get("export")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.read")
  async exportContacts(@Query("organizationId") organizationId: string, @Res() res: Response) {
    const csvData = await this.contactsService.exportContacts(organizationId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=contacts-${organizationId}.csv`);
    return res.send(csvData);
  }

  @Post("import")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.create")
  async importContacts(@Body() dto: { organizationId: string; csvData: string }) {
    return this.contactsService.importContacts(dto.organizationId, dto.csvData);
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.read")
  async get(@Param("id") id: string) {
    return this.contactsService.findOne(id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.create")
  async create(@Body() dto: any) {
    return this.contactsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.update")
  async update(@Param("id") id: string, @Body() dto: any) {
    return this.contactsService.update(id, dto);
  }

  @Post(":id/tags")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.update")
  async addTag(@Param("id") id: string, @Body() dto: { tagId: string }) {
    return this.contactsService.addTag(id, dto.tagId);
  }

  @Delete(":id/tags/:tagId")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.update")
  async removeTag(@Param("id") id: string, @Param("tagId") tagId: string) {
    return this.contactsService.removeTag(id, tagId);
  }

  @Post(":id/custom-fields")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.update")
  async addCustomField(@Param("id") id: string, @Body() dto: { definitionId: string; value: string }) {
    return this.contactsService.setCustomField(id, dto.definitionId, dto.value);
  }

  @Patch(":id/custom-fields/:fieldId")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.update")
  async updateCustomField(@Param("id") id: string, @Param("fieldId") fieldId: string, @Body() dto: { value: string }) {
    return this.contactsService.setCustomField(id, fieldId, dto.value);
  }

  @Post(":id/merge")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.update")
  async merge(@Param("id") id: string, @Body() dto: { targetContactId: string }) {
    return this.contactsService.merge(id, dto.targetContactId);
  }

  @Get(":id/timeline")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.read")
  async timeline(@Param("id") id: string) {
    return this.contactsService.getTimeline(id);
  }
}
