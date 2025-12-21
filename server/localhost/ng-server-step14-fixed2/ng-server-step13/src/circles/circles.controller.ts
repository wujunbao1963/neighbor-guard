import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateCircleDto } from './dto/create-circle.dto';
import { AddCircleMemberDto } from './dto/add-circle-member.dto';
import { CirclesService } from './circles.service';
import { JwtUser } from '../auth/auth.types';

@Controller('api/circles')
export class CirclesController {
  constructor(private readonly circlesService: CirclesService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createCircle(@Req() req: { user: JwtUser }, @Body() dto: CreateCircleDto) {
    return this.circlesService.createCircle(req.user.userId, dto.name);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async listMyCircles(@Req() req: { user: JwtUser }) {
    return this.circlesService.listMyCircles(req.user.userId);
  }

  @Get(':circleId/members')
  @UseGuards(AuthGuard('jwt'))
  async listMembers(@Req() req: { user: JwtUser }, @Param('circleId') circleId: string) {
    return this.circlesService.listMembers(req.user.userId, circleId);
  }

  @Post(':circleId/members')
  @UseGuards(AuthGuard('jwt'))
  async addMember(
    @Req() req: { user: JwtUser },
    @Param('circleId') circleId: string,
    @Body() dto: AddCircleMemberDto,
  ) {
    return this.circlesService.addMember(req.user.userId, circleId, dto);
  }
}
