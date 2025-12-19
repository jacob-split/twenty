/* @license Enterprise */

import { Injectable, Logger } from '@nestjs/common';

import { findOrThrow } from 'twenty-shared/utils';

import type Stripe from 'stripe';

import {
  BillingException,
  BillingExceptionCode,
} from 'src/engine/core-modules/billing/billing.exception';
import { StripeSDKService } from 'src/engine/core-modules/billing/stripe/stripe-sdk/services/stripe-sdk.service';
import { SubscriptionWithSchedule } from 'src/engine/core-modules/billing/types/billing-subscription-with-schedule.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

@Injectable()
export class StripeSubscriptionScheduleService {
  protected readonly logger = new Logger(
    StripeSubscriptionScheduleService.name,
  );
  private readonly stripe: Stripe;

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly stripeSDKService: StripeSDKService,
  ) {
    if (!this.twentyConfigService.get('IS_BILLING_ENABLED')) {
      return;
    }
    this.stripe = this.stripeSDKService.getStripe(
      this.twentyConfigService.get('BILLING_STRIPE_API_KEY'),
    );
  }

  getCurrentAndNextPhases(live: Stripe.SubscriptionSchedule) {
    const now = Math.floor(Date.now() / 1000);

    const currentPhase = findOrThrow(
      live.phases,
      (p) => {
        const s = p.start_date ?? 0;
        const e = p.end_date ?? Infinity;

        return s <= now && now < e;
      },
      new BillingException(
        `Subscription must have at least 1 phase to be editable`,
        BillingExceptionCode.BILLING_SUBSCRIPTION_PHASE_NOT_FOUND,
      ),
    );

    const nextPhase = (live.phases || [])
      .filter((p) => (p.start_date ?? 0) > now)
      .sort((a, b) => (a.start_date ?? 0) - (b.start_date ?? 0))[0] as
      | Stripe.SubscriptionSchedule.Phase
      | undefined;

    return {
      currentPhase,
      nextPhase,
    };
  }

  async getSubscriptionWithSchedule(stripeSubscriptionId: string) {
    return (await this.stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['schedule'],
    })) as SubscriptionWithSchedule;
  }

  async retrieveSchedule(scheduleId: string) {
    if (!this.stripe) throw new Error('Billing is disabled');

    return this.stripe.subscriptionSchedules.retrieve(scheduleId, {
      expand: ['subscription'],
    });
  }

  async updateSchedule(
    scheduleId: string,
    params: Stripe.SubscriptionScheduleUpdateParams,
  ) {
    if (!this.stripe) throw new Error('Billing is disabled');

    return this.stripe.subscriptionSchedules.update(scheduleId, params);
  }

  async createScheduleFromSubscription(subscriptionId: string) {
    if (!this.stripe) throw new Error('Billing is disabled');

    return this.stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
  }

  async findOrCreateSubscriptionSchedule(
    subscription: SubscriptionWithSchedule,
  ) {
    if (subscription.schedule) return subscription.schedule;

    return this.createScheduleFromSubscription(subscription.id);
  }

  async replaceEditablePhases(
    scheduleId: string,
    desired: {
      currentPhaseUpdateParam: Stripe.SubscriptionScheduleUpdateParams.Phase;
      nextPhaseUpdateParam: Stripe.SubscriptionScheduleUpdateParams.Phase;
    },
  ): Promise<Stripe.SubscriptionSchedule> {
    if (!this.stripe) throw new Error('Billing is disabled');

    return this.updateSchedule(scheduleId, {
      phases: [desired.currentPhaseUpdateParam, desired.nextPhaseUpdateParam],
    });
  }

  async release(scheduleId: string) {
    if (!this.stripe) throw new Error('Billing is disabled');

    return this.stripe.subscriptionSchedules.release(scheduleId);
  }
}
