import type { ArchitectureProposal } from "../architecture-proposal";

// Illustrative proposals, not assertions that any topology is the correct design.
export function minimalProposal(): ArchitectureProposal {
  return {
    components: [
      { ref: "client", name: "Client", kind: "client" },
      { ref: "api", name: "API", kind: "service" },
      { ref: "db", name: "Database", kind: "database" },
    ],
    connections: [
      { sourceRef: "client", targetRef: "api", kind: "request-response" },
      { sourceRef: "api", targetRef: "db", kind: "data-access" },
    ],
    summary: "A small application with a client, API, and database.",
    assumptions: [],
  };
}

export function urlShortenerProposal(): ArchitectureProposal {
  return {
    components: [
      { ref: "client", name: "Client", kind: "client" },
      { ref: "gateway", name: "API Gateway", kind: "gateway" },
      { ref: "urls", name: "URL Service", kind: "service" },
      { ref: "cache", name: "Cache", kind: "cache" },
      { ref: "db", name: "Database", kind: "database" },
      { ref: "events", name: "Queue", kind: "queue" },
      { ref: "analytics", name: "Analytics Worker", kind: "service" },
    ],
    connections: [
      { sourceRef: "client", targetRef: "gateway", kind: "request-response" },
      { sourceRef: "gateway", targetRef: "urls", kind: "request-response" },
      { sourceRef: "urls", targetRef: "cache", kind: "data-access" },
      { sourceRef: "urls", targetRef: "db", kind: "data-access" },
      { sourceRef: "urls", targetRef: "events", kind: "async-messaging" },
      { sourceRef: "events", targetRef: "analytics", kind: "async-messaging" },
    ],
    summary: "A read-heavy URL shortener with caching and asynchronous analytics.",
    assumptions: [
      "Traffic is primarily redirects rather than URL creation.",
      "Strong consistency is not required for analytics processing.",
    ],
  };
}

export function jobProcessingProposal(): ArchitectureProposal {
  return {
    components: [
      { ref: "api", name: "Job API", kind: "service" },
      { ref: "queue", name: "Job Queue", kind: "queue" },
      { ref: "worker", name: "Worker", kind: "service" },
      { ref: "results", name: "Results", kind: "storage" },
    ],
    connections: [
      { sourceRef: "api", targetRef: "queue", kind: "async-messaging" },
      { sourceRef: "queue", targetRef: "worker", kind: "async-messaging" },
      { sourceRef: "worker", targetRef: "results", kind: "data-access" },
    ],
    summary: "Jobs are queued for background processing and result storage.",
    assumptions: ["Job completion can happen after the submission request finishes."],
  };
}

export function reciprocalProposal(): ArchitectureProposal {
  return {
    components: [
      { ref: "service", name: "Service", kind: "service" },
      { ref: "cache", name: "Cache", kind: "cache" },
    ],
    connections: [
      { sourceRef: "service", targetRef: "cache", kind: "request-response" },
      { sourceRef: "cache", targetRef: "service", kind: "async-messaging" },
    ],
    summary: "A service accesses a cache that also publishes notifications.",
    assumptions: ["Notifications are distinct from responses to requests."],
  };
}

export const representativeProposals = [
  { name: "URL shortener", create: urlShortenerProposal },
  { name: "asynchronous job processing", create: jobProcessingProposal },
  { name: "minimal application", create: minimalProposal },
  { name: "reciprocal relationship", create: reciprocalProposal },
];
