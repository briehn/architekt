declare const componentIdBrand: unique symbol;
declare const connectionIdBrand: unique symbol;
declare const boundaryIdBrand: unique symbol;

export type ComponentId = string & {
  readonly [componentIdBrand]: "ComponentId";
};

export type ConnectionId = string & {
  readonly [connectionIdBrand]: "ConnectionId";
};

export type BoundaryId = string & {
  readonly [boundaryIdBrand]: "BoundaryId";
};
