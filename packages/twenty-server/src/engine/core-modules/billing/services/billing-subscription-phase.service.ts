/* @license Enterprise */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import Stripe from 'stripe';
import {
  assertIsDefinedOrThrow,
  findOrThrow,
  isDefined,
} from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { BillingPriceEntity } from 'src/engine/core-modules/billing/entities/billing-price.entity';
import { BillingPlanKey } from 'src/engine/core-modules/billing/enums/billing-plan-key.enum';
import { SubscriptionInterval } from 'src/engine/core-modules/billing/enums/billing-subscription-interval.enum';
import { BillingPlanService } from 'src/engine/core-modules/billing/services/billing-plan.service';
import { BillingPriceService } from 'src/engine/core-modules/billing/services/billing-price.service';
import { normalizePriceRef } from 'src/engine/core-modules/billing/utils/normalize-price-ref.utils';

@Injectable()
export class BillingSubscriptionPhaseService {
  constructor(
    @InjectRepository(BillingPriceEntity)
    private readonly billingPriceRepository: Repository<BillingPriceEntity>,
    private readonly billingPlanService: BillingPlanService,
    private readonly billingPriceService: BillingPriceService,
  ) {}

  async getDetailsFromPhase(phase: Stripe.SubscriptionSchedule.Phase) {
    const meteredStripePrice = findOrThrow(
      phase.items,
      ({ quantity }) => !isDefined(quantity),
    ).price;

    const meteredStripePriceId =
      typeof meteredStripePrice === 'string'
        ? meteredStripePrice
        : meteredStripePrice.id;

    const meteredPrice = await this.billingPriceRepository.findOneOrFail({
      where: {
        stripePriceId: meteredStripePriceId,
      },
    });

    const { quantity, price: licensedItemPrice } = findOrThrow(
      phase.items,
      ({ quantity }) => isDefined(quantity),
    );

    const licensedStripePriceId =
      typeof licensedItemPrice === 'string'
        ? licensedItemPrice
        : licensedItemPrice.id;

    const licensedPrice = await this.billingPriceRepository.findOneOrFail({
      where: {
        stripePriceId: licensedStripePriceId,
      },
    });

    const plan = await this.billingPlanService.getPlanByPriceId(
      meteredPrice.stripePriceId,
    );

    if (!isDefined(quantity)) {
      throw new Error('Quantity is not defined');
    }

    return {
      plan,
      meteredPrice,
      licensedPrice,
      quantity,
      interval: meteredPrice.interval,
    };
  }

  toPhaseUpdateParam(
    phase: Stripe.SubscriptionSchedule.Phase,
  ): Stripe.SubscriptionScheduleUpdateParams.Phase {
    return {
      start_date: phase.start_date,
      end_date: phase.end_date ?? undefined,
      items: (phase.items || []).map((it) => ({
        price: normalizePriceRef(it.price) as string,
        quantity: it.quantity ?? undefined,
      })),
      ...(phase.billing_thresholds
        ? { billing_thresholds: phase.billing_thresholds }
        : {}),
      proration_behavior: 'none',
    } as Stripe.SubscriptionScheduleUpdateParams.Phase;
  }

  async buildPhaseUpdateParam(
    base: Stripe.SubscriptionScheduleUpdateParams.Phase,
    licensedPriceId: string,
    seats: number,
    meteredPriceId: string,
  ): Promise<Stripe.SubscriptionScheduleUpdateParams.Phase> {
    return {
      start_date: base.start_date,
      end_date: base.end_date,
      proration_behavior: base.proration_behavior ?? 'none',
      items: [
        { price: licensedPriceId, quantity: seats },
        { price: meteredPriceId },
      ],
      billing_thresholds:
        await this.billingPriceService.getBillingThresholdsByMeterPriceId(
          meteredPriceId,
        ),
    };
  }

  getLicensedPriceIdFromSnapshot(
    phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
  ): string {
    const licensedItem = findOrThrow(phase.items!, (i) => i.quantity != null);

    assertIsDefinedOrThrow(licensedItem.price);

    return licensedItem.price;
  }

  async isSamePhaseSignature(
    a: Stripe.SubscriptionScheduleUpdateParams.Phase,
    b: Stripe.SubscriptionScheduleUpdateParams.Phase,
  ): Promise<boolean> {
    try {
      const sigA = await this.getPhaseSignatureFromUpdateParam(a);
      const sigB = await this.getPhaseSignatureFromUpdateParam(b);

      return (
        sigA.planKey === sigB.planKey &&
        sigA.interval === sigB.interval &&
        sigA.meteredPriceId === sigB.meteredPriceId
      );
    } catch {
      return false;
    }
  }

  private async getPhaseSignatureFromUpdateParam(
    phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
  ): Promise<{
    planKey: BillingPlanKey;
    interval: SubscriptionInterval;
    meteredPriceId: string;
  }> {
    const metered = findOrThrow(phase.items!, (i) => i.quantity == null);
    const meteredPriceId = metered.price;

    assertIsDefinedOrThrow(meteredPriceId);

    const meteredPrice = await this.billingPriceRepository.findOneOrFail({
      where: {
        stripePriceId: meteredPriceId,
      },
      relations: ['billingProduct'],
    });

    const plan = await this.billingPlanService.getPlanByPriceId(meteredPriceId);

    return {
      planKey: plan.planKey,
      interval: meteredPrice.interval,
      meteredPriceId,
    };
  }
}
