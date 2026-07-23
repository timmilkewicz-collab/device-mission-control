export type DomainEvent =
  | {
      type: "ObservationReceived";
      at: string;
      deviceId: string;
      observationId: string;
    }
  | {
      type: "LinkVerificationSucceeded";
      at: string;
      linkId: string;
      transport: string;
      target: string;
      routeQuality?: "direct" | "relay";
    }
  | {
      type: "TaskApproved";
      at: string;
      taskRequestId: string;
      deviceId: string;
      taskId: string;
      actor: string;
    }
  | {
      type: "TaskRejected";
      at: string;
      taskRequestId: string;
      deviceId: string;
      taskId: string;
      actor: string;
    }
  | {
      type: "NodeIdentityReconciled";
      at: string;
      canonicalNodeId: string;
      legacyNodeId: string;
    }
  | {
      type: "CanonicalBriefPublished";
      at: string;
      markdownPath?: string;
    };

export function formatDomainEvent(event: DomainEvent): string {
  return JSON.stringify(event);
}
