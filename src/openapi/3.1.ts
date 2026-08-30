/** Type model for OpenAPI 3.1.x documents. Schema objects use JSON Schema 2020-12. */
export namespace OpenAPI31 {
  export type ExtensionKey = `x-${string}`;
  export type Extensions = { readonly [key: ExtensionKey]: unknown };
  export type HttpMethod =
    | "get"
    | "put"
    | "post"
    | "delete"
    | "options"
    | "head"
    | "patch"
    | "trace";
  export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  export type ResponseCode =
    | `${1 | 2 | 3 | 4 | 5}${Digit}${Digit}`
    | `${1 | 2 | 3 | 4 | 5}XX`;
  export type Reference = {
    readonly $ref: string;
    readonly summary?: string;
    readonly description?: string;
  } & Extensions;
  export type Referenceable<T> = T | Reference;
  export type Schema = boolean | { readonly [keyword: string]: unknown };

  export interface Document extends Extensions {
    readonly openapi: `3.1.${number}${string}`;
    readonly info: Info;
    readonly paths?: Paths;
    readonly webhooks?: Readonly<Record<string, PathItem>>;
    readonly components?: Components;
    readonly jsonSchemaDialect?: string;
    readonly servers?: readonly Server[];
    readonly security?: readonly SecurityRequirement[];
    readonly tags?: readonly Tag[];
    readonly externalDocs?: ExternalDocumentation;
  }
  export interface Info extends Extensions {
    readonly title: string;
    readonly version: string;
    readonly summary?: string;
    readonly description?: string;
    readonly termsOfService?: string;
    readonly contact?: Contact;
    readonly license?: License;
  }
  export interface Contact extends Extensions {
    readonly name?: string;
    readonly url?: string;
    readonly email?: string;
  }
  export interface License extends Extensions {
    readonly name: string;
    readonly identifier?: string;
    readonly url?: string;
  }
  export interface ExternalDocumentation extends Extensions {
    readonly url: string;
    readonly description?: string;
  }
  export interface Tag extends Extensions {
    readonly name: string;
    readonly description?: string;
    readonly externalDocs?: ExternalDocumentation;
  }
  export interface Server extends Extensions {
    readonly url: string;
    readonly description?: string;
    readonly variables?: Readonly<Record<string, ServerVariable>>;
  }
  export interface ServerVariable extends Extensions {
    readonly default: string;
    readonly enum?: readonly string[];
    readonly description?: string;
  }

  export type Paths = Readonly<Record<`/${string}`, PathItem>> & Extensions;
  export interface PathItem
    extends Extensions,
      Partial<Record<HttpMethod, Operation>> {
    readonly $ref?: string;
    readonly summary?: string;
    readonly description?: string;
    readonly servers?: readonly Server[];
    readonly parameters?: readonly Referenceable<Parameter>[];
  }
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
  export type ParameterLocation = "query" | "header" | "path" | "cookie";
  export interface Parameter extends Extensions {
    readonly name: string;
    readonly in: ParameterLocation;
    readonly description?: string;
    readonly required?: boolean;
    readonly deprecated?: boolean;
    readonly schema?: Schema;
    readonly content?: Content;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    readonly style?: string;
    readonly explode?: boolean;
    readonly allowReserved?: boolean;
    readonly allowEmptyValue?: boolean;
  }
  export interface Header extends Extensions {
    readonly description?: string;
    readonly required?: boolean;
    readonly deprecated?: boolean;
    readonly schema?: Schema;
    readonly content?: Content;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    readonly style?: "simple";
    readonly explode?: boolean;
  }
  export interface RequestBody extends Extensions {
    readonly content: Content;
    readonly description?: string;
    readonly required?: boolean;
  }
  export type Responses = Readonly<
    Partial<Record<ResponseCode, Referenceable<Response>>>
  > & { readonly default?: Referenceable<Response> } & Extensions;
  export interface Response extends Extensions {
    readonly description: string;
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    readonly content?: Content;
    readonly links?: Readonly<Record<string, Referenceable<Link>>>;
  }
  export type Content = Readonly<Record<string, MediaType>>;
  export interface MediaType extends Extensions {
    readonly schema?: Schema;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
    readonly encoding?: Readonly<Record<string, Encoding>>;
  }
  export interface Encoding extends Extensions {
    readonly contentType?: string;
    readonly headers?: Readonly<Record<string, Referenceable<Header>>>;
    readonly style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";
    readonly explode?: boolean;
    readonly allowReserved?: boolean;
  }
  export interface Example extends Extensions {
    readonly summary?: string;
    readonly description?: string;
    readonly value?: unknown;
    readonly externalValue?: string;
  }
  export interface Link extends Extensions {
    readonly operationRef?: string;
    readonly operationId?: string;
    readonly parameters?: Readonly<Record<string, string>>;
    readonly requestBody?: unknown;
    readonly description?: string;
    readonly server?: Server;
  }
  export type Callback = Readonly<Record<string, PathItem>> & Extensions;

  export interface Components extends Extensions {
    readonly schemas?: Readonly<Record<string, Schema>>;
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
    readonly pathItems?: Readonly<Record<string, PathItem>>;
  }
  export type SecurityRequirement = Readonly<Record<string, readonly string[]>>;
  export type SecurityScheme =
    | ApiKeySecurityScheme
    | HttpSecurityScheme
    | MutualTLSSecurityScheme
    | OAuth2SecurityScheme
    | OpenIdConnectSecurityScheme;
  export interface ApiKeySecurityScheme extends Extensions {
    readonly type: "apiKey";
    readonly name: string;
    readonly in: "query" | "header" | "cookie";
    readonly description?: string;
  }
  export interface HttpSecurityScheme extends Extensions {
    readonly type: "http";
    readonly scheme: string;
    readonly bearerFormat?: string;
    readonly description?: string;
  }
  export interface MutualTLSSecurityScheme extends Extensions {
    readonly type: "mutualTLS";
    readonly description?: string;
  }
  export interface OAuth2SecurityScheme extends Extensions {
    readonly type: "oauth2";
    readonly flows: OAuthFlows;
    readonly description?: string;
  }
  export interface OpenIdConnectSecurityScheme extends Extensions {
    readonly type: "openIdConnect";
    readonly openIdConnectUrl: string;
    readonly description?: string;
  }
  export interface OAuthFlows extends Extensions {
    readonly implicit?: ImplicitOAuthFlow;
    readonly password?: PasswordOAuthFlow;
    readonly clientCredentials?: ClientCredentialsOAuthFlow;
    readonly authorizationCode?: AuthorizationCodeOAuthFlow;
  }
  export interface ImplicitOAuthFlow extends Extensions {
    readonly authorizationUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
  export interface PasswordOAuthFlow extends Extensions {
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
  export interface ClientCredentialsOAuthFlow extends Extensions {
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
  export interface AuthorizationCodeOAuthFlow extends Extensions {
    readonly authorizationUrl: string;
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Readonly<Record<string, string>>;
  }
}
