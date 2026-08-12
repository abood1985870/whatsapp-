import { Module } from "@nestjs/common";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";
import { SubscriptionRequestsController } from "./subscription-requests.controller";
import { SubscriptionRequestsService } from "./subscription-requests.service";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionService } from "./subscription.service";

@Module({
  controllers: [PlansController, PricingController, SubscriptionRequestsController, SubscriptionController],
  providers: [PlansService, PricingService, SubscriptionRequestsService, SubscriptionService],
})
export class SubscriptionsModule {}
