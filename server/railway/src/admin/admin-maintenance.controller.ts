import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtUser } from '../auth/auth.types';
import { EvidenceTicketsService } from '../evidence-tickets/evidence-tickets.service';

@Controller('/api/admin/maintenance')
export class AdminMaintenanceController {
  constructor(private readonly evidence: EvidenceTicketsService) {}

  // Minimal maintenance endpoint for MVP/testing.
  // In production, restrict to admins only.
  @Post('purge-expired')
  @UseGuards(AuthGuard('jwt'))
  async purgeExpired(@Req() req: { user: JwtUser }) {
    // req.user is unused for now; kept for future admin authorization.
    const r = await this.evidence.purgeExpired();
    return { ok: true, ...r };
  }
}
