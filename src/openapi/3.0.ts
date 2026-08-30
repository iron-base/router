/**
 * Type model for OpenAPI 3.0.x documents.
 * Property descriptions follow the normative OpenAPI 3.0.3 specification.
 * @see https://spec.openapis.org/oas/v3.0.3.html
 */
export namespace OpenAPI30 {
  /** A specification-extension field name. */
  export type ExtensionKey = `x-${string}`;
  /** Specification extensions keyed by `x-` prefixed names. */
  export type Extensions = { readonly [key: ExtensionKey]: unknown };
  /** An HTTP method name supported by a Path Item. */
  export type HttpMethod =
    | "get"
    | "put"
    | "post"
    | "delete"
    | "options"
    | "head"
    | "patch"
    | "trace";
  /** A decimal digit used in a response code template. */
  export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** A three-digit HTTP response code or response-code range. */
  export type ResponseCode =
    | `${1 | 2 | 3 | 4 | 5}${Digit}${Digit}`
    | `${1 | 2 | 3 | 4 | 5}XX`;
  /** A URI reference to another OpenAPI element. */
  export type Reference = {
    /** The URI reference. */ readonly $ref: string;
  } & Extensions;
  /** An element or a reference to that element. */
  export type Referenceable<T> = T | Reference;

  /** The root object of an OpenAPI document. */
  export interface Document extends Extensions {
    /** The OpenAPI Specification version used by this document. */
    readonly openapi: `3.0.${number}${string}`;
    /** Metadata about the API. */
    readonly info: Info;
    /** Available API paths and operations. */
    readonly paths: Paths;
    /** Additional external documentation. */
    readonly externalDocs?: ExternalDocumentation;
    /** Connectivity information for target servers. */
    readonly servers?: readonly Server[];
    /** Security mechanisms that can authorize requests across the API. */
    readonly security?: readonly SecurityRequirement[];
    /** Tags and their additional metadata. */
    readonly tags?: readonly Tag[];
    /** Reusable objects for different aspects of the specification. */
    readonly components?: Components;
  }

  /** Metadata about the API for clients and documentation tools. */
  export interface Info extends Extensions {
    /** The API title. */
    readonly title: string;
    /** The OpenAPI document version. */
    readonly version: string;
    /** A short API description supporting CommonMark. */
    readonly description?: string;
    /** A URL for the API terms of service. */
    readonly termsOfService?: string;
    /** Contact information for the exposed API. */
    readonly contact?: Contact;
    /** License information for the exposed API. */
    readonly license?: License;
  }
  /** Contact information for the exposed API. */
  export interface Contact extends Extensions {
    /** The identifying name of the contact person or organization. */
    readonly name?: string;
    /** The URL for contact information. */
    readonly url?: string;
    /** The contact email address. */
    readonly email?: string;
  }
  /** License information for the exposed API. */
  export interface License extends Extensions {
    /** The license name used for the API. */
    readonly name: string;
    /** The URL for the license used for the API. */
    readonly url?: string;
  }
  /** A reference to external documentation. */
  export interface ExternalDocumentation extends Extensions {
    /** The target documentation URL. */
    readonly url: string;
    /** A short target-documentation description supporting CommonMark. */
    readonly description?: string;
  }
  /** Metadata used to group operations. */
  export interface Tag extends Extensions {
    readonly name: string;
    readonly description?: string;
    readonly externalDocs?: ExternalDocumentation;
  }
  /** A target server. */
  export interface Server extends Extensions {
    readonly url: string;
    readonly description?: string;
    readonly variables?: Readonly<Record<string, ServerVariable>>;
  }
  /** A server URL template substitution variable. */
  export interface ServerVariable extends Extensions {
    readonly default: string;
    readonly enum?: readonly string[];
    readonly description?: string;
  }

  /** Relative paths to API endpoints and their operations. */
  export type Paths = Readonly<Record<`/${string}`, PathItem>> & Extensions;
  /** Operations and shared parameters available at a single path. */
  export interface PathItem
    extends Extensions,
      Partial<Record<HttpMethod, Operation>> {
    readonly $ref?: string;
    readonly summary?: string;
    readonly description?: string;
    readonly servers?: readonly Server[];
    readonly parameters?: readonly Referenceable<Parameter>[];
  }
  /** A single API operation on a path. */
  export interface Operation extends Extensions {
    readonly responses: Responses;
    readonly tags?: readonly string[];
    readonly summary?: string;
    readonly description?: string;
    readonly externalDocs?: ExternalDocumentation;
    readonly operationId?: string;
    readonly parameters?: readonly Referenceable<Parameter>[];
    readonly requestBody?: Referenceable<RequestBody>;
    readonly callbacks?: Readonly<Record<string, Referenceable<Callback>>>;
    readonly deprecated?: boolean;
    readonly security?: readonly SecurityRequirement[];
    readonly servers?: readonly Server[];
  }

  /** The location where a parameter is supplied. */
  export type ParameterLocation = "query" | "header" | "path" | "cookie";
  /** A single operation parameter. */
  export interface Parameter extends Extensions {
    readonly name: string;
    readonly in: ParameterLocation;
    readonly description?: string;
    readonly required?: boolean;
    readonly deprecated?: boolean;
    readonly allowEmptyValue?: boolean;
    readonly style?: string;
    readonly explode?: boolean;
    readonly allowReserved?: boolean;
    readonly schema?: Schema;
    readonly content?: Content;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
  }
  /** A response header, modeled after a Parameter Object without `name` or `in`. */
  export interface Header extends Extensions {
    readonly description?: string;
    readonly required?: boolean;
    readonly deprecated?: boolean;
    readonly allowEmptyValue?: boolean;
    readonly style?: "simple";
    readonly explode?: boolean;
    readonly allowReserved?: boolean;
    readonly schema?: Schema;
    readonly content?: Content;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
  }
  /** The request body applicable to an operation. */
  export interface RequestBody extends Extensions {
    readonly content: Content;
    readonly description?: string;
    readonly required?: boolean;
  }
  /** A map of response codes to response definitions. */
  export type Responses = Readonly<
    Partial<Record<ResponseCode, Referenceable<Response>>>
  > & { readonly default?: Referenceable<Response> } & Extensions;
  /** A response returned from an operation. */
  export interface Response extends Extensions {
    readonly description: string;
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    readonly content?: Content;
    readonly links?: Readonly<Record<string, Referenceable<Link>>>;
  }
  /** A map of media types to their representations. */
  export type Content = Readonly<Record<string, MediaType>>;
  /** A media-type representation. */
  export interface MediaType extends Extensions {
    readonly schema?: Schema;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    readonly encoding?: Readonly<Record<string, Encoding>>;
  }
  /** Serialization instructions for a multipart or form property. */
  export interface Encoding extends Extensions {
    readonly contentType?: string;
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    readonly style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";
    readonly explode?: boolean;
    readonly allowReserved?: boolean;
  }
  /** A concrete or external example of a media value. */
  export interface Example extends Extensions {
    readonly summary?: string;
    readonly description?: string;
    readonly value?: unknown;
    readonly externalValue?: string;
  }
  /** A possible design-time link to another operation. */
  export interface Link extends Extensions {
    readonly operationRef?: string;
    readonly operationId?: string;
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly requestBody?: unknown;
    readonly description?: string;
    readonly server?: Server;
  }
  /** A map of runtime expressions to callback Path Items. */
  export type Callback = Readonly<Record<string, PathItem>> & Extensions;

  /** Reusable objects for different aspects of an OpenAPI document. */
  export interface Components extends Extensions {
    readonly schemas?: Readonly<Record<string, Referenceable<Schema>>>;
    readonly responses?: Readonly<Record<string, Referenceable<Response>>>;
    readonly parameters?: Readonly<Record<string, Referenceable<Parameter>>>;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    readonly requestBodies?: Readonly<
      Record<string, Referenceable<RequestBody>>
    >;
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    readonly securitySchemes?: Readonly<
      Record<string, Referenceable<SecurityScheme>>
    >;
    readonly links?: Readonly<Record<string, Referenceable<Link>>>;
    readonly callbacks?: Readonly<Record<string, Referenceable<Callback>>>;
  }
  /** Security-scheme names mapped to the scopes required for each scheme. */
  export type SecurityRequirement = Readonly<Record<string, readonly string[]>>;
  /** A security scheme supported by an API. */
  export type SecurityScheme =
    | ApiKeySecurityScheme
    | HttpSecurityScheme
    | OAuth2SecurityScheme
    | OpenIdConnectSecurityScheme;
  /** An API key sent in a query parameter, header, or cookie. */
  export interface ApiKeySecurityScheme extends Extensions {
    readonly type: "apiKey";
    readonly name: string;
    readonly in: "query" | "header" | "cookie";
    readonly description?: string;
  }
  /** An HTTP authentication security scheme. */
  export interface HttpSecurityScheme extends Extensions {
    readonly type: "http";
    readonly scheme: string;
    readonly bearerFormat?: string;
    readonly description?: string;
  }
  /** An OAuth 2.0 authentication security scheme. */
  export interface OAuth2SecurityScheme extends Extensions {
    readonly type: "oauth2";
    readonly flows: OAuthFlows;
    readonly description?: string;
  }
  /** An OpenID Connect Discovery authentication security scheme. */
  export interface OpenIdConnectSecurityScheme extends Extensions {
    readonly type: "openIdConnect";
    readonly openIdConnectUrl: string;
    readonly description?: string;
  }
  /** Supported OAuth 2.0 authorization flows. */
  export interface OAuthFlows extends Extensions {
    readonly implicit?: ImplicitOAuthFlow;
    readonly password?: PasswordOAuthFlow;
    readonly clientCredentials?: ClientCredentialsOAuthFlow;
    readonly authorizationCode?: AuthorizationCodeOAuthFlow;
  }
  /** OAuth 2.0 implicit-flow configuration. */
  export interface ImplicitOAuthFlow extends Extensions {
    readonly authorizationUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
  /** OAuth 2.0 password-flow configuration. */
  export interface PasswordOAuthFlow extends Extensions {
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
  /** OAuth 2.0 client-credentials-flow configuration. */
  export interface ClientCredentialsOAuthFlow extends Extensions {
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
  /** OAuth 2.0 authorization-code-flow configuration. */
  export interface AuthorizationCodeOAuthFlow extends Extensions {
    readonly authorizationUrl: string;
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }

  /** A Schema Object or reference to one. */
  export type Schema = SchemaObject | Reference;
  /** A JSON Schema Wright Draft 00 subset extended for OpenAPI. */
  export interface SchemaObject extends Extensions {
    readonly title?: string;
    readonly type?:
      | "array"
      | "boolean"
      | "integer"
      | "number"
      | "object"
      | "string";
    readonly format?: string;
    readonly description?: string;
    readonly default?: unknown;
    readonly enum?: readonly unknown[];
    readonly nullable?: boolean;
    readonly deprecated?: boolean;
    readonly readOnly?: boolean;
    readonly writeOnly?: boolean;
    readonly example?: unknown;
    readonly multipleOf?: number;
    readonly maximum?: number;
    readonly exclusiveMaximum?: boolean;
    readonly minimum?: number;
    readonly exclusiveMinimum?: boolean;
    readonly maxLength?: number;
    readonly minLength?: number;
    readonly pattern?: string;
    readonly maxItems?: number;
    readonly minItems?: number;
    readonly uniqueItems?: boolean;
    readonly maxProperties?: number;
    readonly minProperties?: number;
    readonly required?: readonly string[];
    readonly items?: Schema;
    readonly properties?: Readonly<Record<string, Schema>>;
    readonly additionalProperties?: Schema | boolean;
    readonly allOf?: readonly Schema[];
    readonly oneOf?: readonly Schema[];
    readonly anyOf?: readonly Schema[];
    readonly not?: Schema;
    readonly discriminator?: Discriminator;
    readonly xml?: XML;
    readonly externalDocs?: ExternalDocumentation;
  }
  /** Adds support for polymorphism to a schema. */
  export interface Discriminator {
    readonly propertyName: string;
    readonly mapping?: Readonly<Record<string, string>>;
  }
  /** XML representation metadata for a schema. */
  export interface XML extends Extensions {
    readonly name?: string;
    readonly namespace?: string;
    readonly prefix?: string;
    readonly attribute?: boolean;
    readonly wrapped?: boolean;
  }
}
