import {
  CouncilResponseInput,
  CouncilSession,
  CouncilSessionInput,
  HubState,
  generateId,
  nowIso
} from "../../shared/types";

export class CouncilRepository {
  createSession(state: HubState, input: CouncilSessionInput): CouncilSession {
    const timestamp = nowIso();
    const session: CouncilSession = {
      id: generateId("council"),
      topic: input.topic,
      prompt: input.prompt,
      requestedBy: input.requestedBy,
      targetMemberIds: input.targetMemberIds,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
      responses: []
    };

    state.councilSessions.push(session);
    return session;
  }

  addResponse(state: HubState, councilSessionId: string, input: CouncilResponseInput): CouncilSession {
    const session = state.councilSessions.find((entry) => entry.id === councilSessionId);
    if (!session) {
      throw new Error(`Unknown council session: ${councilSessionId}`);
    }
    if (session.status !== "open") {
      throw new Error(`Council session ${councilSessionId} is closed.`);
    }

    session.responses.push({
      id: generateId("vote"),
      memberId: input.memberId,
      memberLabel: input.memberLabel,
      stance: input.stance,
      summary: input.summary,
      detail: input.detail,
      submittedAt: nowIso()
    });
    session.updatedAt = nowIso();

    return session;
  }

  closeSession(state: HubState, councilSessionId: string): CouncilSession {
    const session = state.councilSessions.find((entry) => entry.id === councilSessionId);
    if (!session) {
      throw new Error(`Unknown council session: ${councilSessionId}`);
    }

    const timestamp = nowIso();
    session.status = "closed";
    session.closedAt = timestamp;
    session.updatedAt = timestamp;

    return session;
  }

  listSessions(state: HubState): CouncilSession[] {
    return [...state.councilSessions].reverse();
  }

  getSession(state: HubState, sessionId: string): CouncilSession | undefined {
    return state.councilSessions.find((entry) => entry.id === sessionId);
  }
}

export const councilRepository = new CouncilRepository();
