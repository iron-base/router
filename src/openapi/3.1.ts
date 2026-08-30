/**
 * Type model for OpenAPI 3.1.x documents. Schema objects use JSON Schema 2020-12.
 * Property descriptions follow the normative OpenAPI 3.1.1 specification.
 * @see https://spec.openapis.org/oas/v3.1.1.html
 */
export namespace OpenAPI31 {
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
  /** A URI reference to another OpenAPI element with optional annotations. */
  export type Reference = {
    /** The URI reference. */
    readonly $ref: string;
    /** A short summary of the referenced element. */
    readonly summary?: string;
    /** A description of the referenced element that supports CommonMark. */
    readonly description?: string;
  } & Extensions;
  /** An element or a reference to that element. */
  export type Referenceable<T> = T | Reference;
  /** A JSON Schema 2020-12 boolean or keyword object. */
  export type Schema = boolean | { readonly [keyword: string]: unknown };

  /** The root object of an OpenAPI Description. */
  export interface Document extends Extensions {
    /** The OpenAPI Specification version used by this document. */
    readonly openapi: `3.1.${number}${string}`;
    /** Metadata about the API. */
    readonly info: Info;
    /** Available API paths and operations. */
    readonly paths?: Paths;
    /** Incoming webhooks the API consumer may choose to implement. */
    readonly webhooks?: Readonly<Record<string, PathItem>>;
    /** Reusable OpenAPI Description objects. */
    readonly components?: Components;
    /** The default `$schema` URI for contained Schema Objects. */
    readonly jsonSchemaDialect?: string;
    /** Connectivity information for target servers. */
    readonly servers?: readonly Server[];
    /** Security mechanisms that can authorize requests across the API. */
    readonly security?: readonly SecurityRequirement[];
    /** Tags and their additional metadata. */
    readonly tags?: readonly Tag[];
    /** Additional external documentation. */
    readonly externalDocs?: ExternalDocumentation;
  }
  /** Metadata about the API for clients and documentation tools. */
  export interface Info extends Extensions {
    /** The API title. */
    readonly title: string;
    /** The OpenAPI Document version. */
    readonly version: string;
    /** A short API summary. */
    readonly summary?: string;
    /** An API description supporting CommonMark. */
    readonly description?: string;
    /** A URI for the API terms of service. */
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
    /** A URI for the contact information. */
    readonly url?: string;
    /** The contact email address. */
    readonly email?: string;
  }
  /** License information for the exposed API. */
  export interface License extends Extensions {
    /** The license name used for the API. */
    readonly name: string;
    /** An SPDX license expression, mutually exclusive with `url`. */
    readonly identifier?: string;
    /** A URI for the license, mutually exclusive with `identifier`. */
    readonly url?: string;
  }
  /** A reference to external documentation. */
  export interface ExternalDocumentation extends Extensions {
    /** The target documentation URI. */
    readonly url: string;
    /** A short target-documentation description supporting CommonMark. */
    readonly description?: string;
  }
  /** Metadata used to group operations. */
  export interface Tag extends Extensions {
    /** The tag name. */
    readonly name: string;
    /** A tag description supporting CommonMark. */
    readonly description?: string;
    /** External documentation for this tag. */
    readonly externalDocs?: ExternalDocumentation;
  }
  /** A target server. */
  export interface Server extends Extensions {
    /** The target-host URL, which supports Server Variables. */
    readonly url: string;
    /** An optional host description supporting CommonMark. */
    readonly description?: string;
    /** Values substituted into the server URL template. */
    readonly variables?: Readonly<Record<string, ServerVariable>>;
  }
  /** A server URL template substitution variable. */
  export interface ServerVariable extends Extensions {
    /** The default substitution value. */
    readonly default: string;
    /** The permitted substitution values. */
    readonly enum?: readonly string[];
    /** An optional variable description supporting CommonMark. */
    readonly description?: string;
  }

  /** Relative paths to API endpoints and their operations. */
  export type Paths = Readonly<Record<`/${string}`, PathItem>> & Extensions;
  /** Operations and shared parameters available at a single path. */
  export interface PathItem
    extends Extensions,
      Partial<Record<HttpMethod, Operation>> {
    /** A URI reference to a Path Item Object. */
    readonly $ref?: string;
    /** A summary intended for all operations at this path. */
    readonly summary?: string;
    /** A description intended for all operations at this path. */
    readonly description?: string;
    /** Alternative servers for all operations at this path. */
    readonly servers?: readonly Server[];
    /** Parameters applicable to all operations at this path. */
    readonly parameters?: readonly Referenceable<Parameter>[];
  }
  /** A single API operation on a path. */
  export interface Operation extends Extensions {
    /** The possible responses returned by the operation. */
    readonly responses: Responses;
    /** Tags for grouping the operation in API documentation. */
    readonly tags?: readonly string[];
    /** A short summary of the operation. */
    readonly summary?: string;
    /** A detailed operation description supporting CommonMark. */
    readonly description?: string;
    /** Additional external documentation for this operation. */
    readonly externalDocs?: ExternalDocumentation;
    /** A unique, case-sensitive operation identifier. */
    readonly operationId?: string;
    /** Parameters applicable to this operation. */
    readonly parameters?: readonly Referenceable<Parameter>[];
    /** The request body applicable to this operation. */
    readonly requestBody?: Referenceable<RequestBody>;
    /** Out-of-band callbacks related to this operation. */
    readonly callbacks?: Readonly<Record<string, Referenceable<Callback>>>;
    /** Whether consumers should refrain from using this operation. */
    readonly deprecated?: boolean;
    /** Security mechanisms that can authorize this operation. */
    readonly security?: readonly SecurityRequirement[];
    /** Alternative servers for this operation. */
    readonly servers?: readonly Server[];
  }
  /** The location where a parameter is supplied. */
  export type ParameterLocation = "query" | "header" | "path" | "cookie";
  /** A single operation parameter. */
  export interface Parameter extends Extensions {
    /** The case-sensitive parameter name. */
    readonly name: string;
    /** The parameter location. */
    readonly in: ParameterLocation;
    /** A parameter description supporting CommonMark. */
    readonly description?: string;
    /** Whether the parameter is mandatory; path parameters must be required. */
    readonly required?: boolean;
    /** Whether this parameter should be transitioned out of use. */
    readonly deprecated?: boolean;
    /** The parameter value schema. */
    readonly schema?: Schema;
    /** The parameter media-type representation; mutually exclusive with `schema`. */
    readonly content?: Content;
    /** An example parameter value, mutually exclusive with `examples`. */
    readonly example?: unknown;
    /** Potential parameter values, mutually exclusive with `example`. */
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    /** The parameter serialization style. */
    readonly style?: string;
    /** Whether array or object values use separate parameters. */
    readonly explode?: boolean;
    /** Whether query values may contain reserved URI characters unescaped. */
    readonly allowReserved?: boolean;
    /** Whether an empty value may be sent; this is not recommended. */
    readonly allowEmptyValue?: boolean;
  }
  /** A response header, modeled after a Parameter Object without `name` or `in`. */
  export interface Header extends Extensions {
    /** A header description supporting CommonMark. */
    readonly description?: string;
    /** Whether this header is mandatory. */
    readonly required?: boolean;
    /** Whether this header should be transitioned out of use. */
    readonly deprecated?: boolean;
    /** The header value schema. */
    readonly schema?: Schema;
    /** The header media-type representation; mutually exclusive with `schema`. */
    readonly content?: Content;
    /** An example header value, mutually exclusive with `examples`. */
    readonly example?: unknown;
    /** Potential header values, mutually exclusive with `example`. */
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    /** The header serialization style. */
    readonly style?: "simple";
    /** Whether array or object header values use separate parameters. */
    readonly explode?: boolean;
  }
  /** The request body applicable to an operation. */
  export interface RequestBody extends Extensions {
    /** The request body media-type representations. */
    readonly content: Content;
    /** A request body description supporting CommonMark. */
    readonly description?: string;
    /** Whether the request body is required. */
    readonly required?: boolean;
  }
  /** A map of response codes to response definitions. */
  export type Responses = Readonly<
    Partial<Record<ResponseCode, Referenceable<Response>>>
  > & { readonly default?: Referenceable<Response> } & Extensions;
  /** A response returned from an operation. */
  export interface Response extends Extensions {
    /** A required response description supporting CommonMark. */
    readonly description: string;
    /** Headers returned with this response. */
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    /** Response media-type representations. */
    readonly content?: Content;
    /** Links that may be followed from this response. */
    readonly links?: Readonly<Record<string, Referenceable<Link>>>;
  }
  /** A map of media types to their representations. */
  export type Content = Readonly<Record<string, MediaType>>;
  /** A media-type representation. */
  export interface MediaType extends Extensions {
    /** The media type schema. */
    readonly schema?: Schema;
    /** An example media value, mutually exclusive with `examples`. */
    readonly example?: unknown;
    /** Potential media values, mutually exclusive with `example`. */
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    /** Serialization instructions for individual properties. */
    readonly encoding?: Readonly<Record<string, Encoding>>;
  }
  /** Serialization instructions for a multipart or form property. */
  export interface Encoding extends Extensions {
    /** The content type for the property. */
    readonly contentType?: string;
    /** Headers included with the property. */
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    /** The serialization style for the property. */
    readonly style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";
    /** Whether array or object values use separate parameters. */
    readonly explode?: boolean;
    /** Whether reserved URI characters may appear unescaped. */
    readonly allowReserved?: boolean;
  }
  /** A concrete or external example of a media value. */
  export interface Example extends Extensions {
    /** A short example summary. */
    readonly summary?: string;
    /** An example description supporting CommonMark. */
    readonly description?: string;
    /** The embedded example value. */
    readonly value?: unknown;
    /** A URI for an external example value. */
    readonly externalValue?: string;
  }
  /** A possible design-time link to another operation. */
  export interface Link extends Extensions {
    /** A URI reference to the linked operation. */
    readonly operationRef?: string;
    /** The unique identifier of the linked operation. */
    readonly operationId?: string;
    /** Parameters to pass to the linked operation. */
    readonly parameters?: Readonly<Record<string, string>>;
    /** The request body to pass to the linked operation. */
    readonly requestBody?: unknown;
    /** A link description supporting CommonMark. */
    readonly description?: string;
    /** The server hosting the linked operation. */
    readonly server?: Server;
  }
  /** A map of runtime expressions to callback Path Items. */
  export type Callback = Readonly<Record<string, PathItem>> & Extensions;

  /** Reusable objects for different aspects of an OpenAPI Description. */
  export interface Components extends Extensions {
    /** Reusable Schema Objects. */
    readonly schemas?: Readonly<Record<string, Schema>>;
    /** Reusable Response Objects. */
    readonly responses?: Readonly<Record<string, Referenceable<Response>>>;
    /** Reusable Parameter Objects. */
    readonly parameters?: Readonly<Record<string, Referenceable<Parameter>>>;
    /** Reusable Example Objects. */
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    /** Reusable Request Body Objects. */
    readonly requestBodies?: Readonly<
      Record<string, Referenceable<RequestBody>>
    >;
    /** Reusable Header Objects. */
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    /** Reusable Security Scheme Objects. */
    readonly securitySchemes?: Readonly<
      Record<string, Referenceable<SecurityScheme>>
    >;
    /** Reusable Link Objects. */
    readonly links?: Readonly<Record<string, Referenceable<Link>>>;
    /** Reusable Callback Objects. */
    readonly callbacks?: Readonly<Record<string, Referenceable<Callback>>>;
    /** Reusable Path Item Objects. */
    readonly pathItems?: Readonly<Record<string, PathItem>>;
  }
  /** Security-scheme names mapped to the scopes required for each scheme. */
  export type SecurityRequirement = Readonly<Record<string, readonly string[]>>;
  /** A security scheme supported by an API. */
  export type SecurityScheme =
    | ApiKeySecurityScheme
    | HttpSecurityScheme
    | MutualTLSSecurityScheme
    | OAuth2SecurityScheme
    | OpenIdConnectSecurityScheme;
  /** An API key sent in a query parameter, header, or cookie. */
  export interface ApiKeySecurityScheme extends Extensions {
    /** The security-scheme type. */
    readonly type: "apiKey";
    /** The API key parameter, header, or cookie name. */
    readonly name: string;
    /** The location where the API key is sent. */
    readonly in: "query" | "header" | "cookie";
    /** A security-scheme description supporting CommonMark. */
    readonly description?: string;
  }
  /** An HTTP authentication security scheme. */
  export interface HttpSecurityScheme extends Extensions {
    /** The security-scheme type. */
    readonly type: "http";
    /** The HTTP Authentication scheme name. */
    readonly scheme: string;
    /** A hint to clients about the bearer token format. */
    readonly bearerFormat?: string;
    /** A security-scheme description supporting CommonMark. */
    readonly description?: string;
  }
  /** A mutual TLS authentication security scheme. */
  export interface MutualTLSSecurityScheme extends Extensions {
    /** The security-scheme type. */
    readonly type: "mutualTLS";
    /** A security-scheme description supporting CommonMark. */
    readonly description?: string;
  }
  /** An OAuth 2.0 authentication security scheme. */
  export interface OAuth2SecurityScheme extends Extensions {
    /** The security-scheme type. */
    readonly type: "oauth2";
    /** The supported OAuth 2.0 flows. */
    readonly flows: OAuthFlows;
    /** A security-scheme description supporting CommonMark. */
    readonly description?: string;
  }
  /** An OpenID Connect Discovery authentication security scheme. */
  export interface OpenIdConnectSecurityScheme extends Extensions {
    /** The security-scheme type. */
    readonly type: "openIdConnect";
    /** The OpenID Connect Discovery URI. */
    readonly openIdConnectUrl: string;
    /** A security-scheme description supporting CommonMark. */
    readonly description?: string;
  }
  /** Supported OAuth 2.0 authorization flows. */
  export interface OAuthFlows extends Extensions {
    /** The implicit authorization flow. */
    readonly implicit?: ImplicitOAuthFlow;
    /** The resource-owner password credentials flow. */
    readonly password?: PasswordOAuthFlow;
    /** The client credentials flow. */
    readonly clientCredentials?: ClientCredentialsOAuthFlow;
    /** The authorization code flow. */
    readonly authorizationCode?: AuthorizationCodeOAuthFlow;
  }
  /** OAuth 2.0 implicit-flow configuration. */
  export interface ImplicitOAuthFlow extends Extensions {
    /** The authorization endpoint URI. */
    readonly authorizationUrl: string;
    /** The optional refresh endpoint URI. */
    readonly refreshUrl?: string;
    /** Available OAuth 2.0 scopes and their descriptions. */
    readonly scopes: Readonly<Record<string, string>>;
  }
  /** OAuth 2.0 password-flow configuration. */
  export interface PasswordOAuthFlow extends Extensions {
    /** The token endpoint URI. */
    readonly tokenUrl: string;
    /** The optional refresh endpoint URI. */
    readonly refreshUrl?: string;
    /** Available OAuth 2.0 scopes and their descriptions. */
    readonly scopes: Readonly<Record<string, string>>;
  }
  /** OAuth 2.0 client-credentials-flow configuration. */
  export interface ClientCredentialsOAuthFlow extends Extensions {
    /** The token endpoint URI. */
    readonly tokenUrl: string;
    /** The optional refresh endpoint URI. */
    readonly refreshUrl?: string;
    /** Available OAuth 2.0 scopes and their descriptions. */
    readonly scopes: Readonly<Record<string, string>>;
  }
  /** OAuth 2.0 authorization-code-flow configuration. */
  export interface AuthorizationCodeOAuthFlow extends Extensions {
    /** The authorization endpoint URI. */
    readonly authorizationUrl: string;
    /** The token endpoint URI. */
    readonly tokenUrl: string;
    /** The optional refresh endpoint URI. */
    readonly refreshUrl?: string;
    /** Available OAuth 2.0 scopes and their descriptions. */
    readonly scopes: Readonly<Record<string, string>>;
  }
}
