/** Type model for OpenAPI 3.0.x documents. */
export namespace OpenAPI30 {
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
  export type Reference = { readonly $ref: string } & Extensions;
  export type Referenceable<T> = T | Reference;

  export interface Document extends Extensions {
    readonly openapi: `3.0.${number}${string}`;
    readonly info: Info;
    readonly paths: Paths;
    readonly externalDocs?: ExternalDocumentation;
    readonly servers?: readonly Server[];
    readonly security?: readonly SecurityRequirement[];
    readonly tags?: readonly Tag[];
    readonly components?: Components;
  }

  export interface Info extends Extensions {
    readonly title: string;
    readonly version: string;
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
    readonly allowEmptyValue?: boolean;
    readonly style?: string;
    readonly explode?: boolean;
    readonly allowReserved?: boolean;
    readonly schema?: Schema;
    readonly content?: Content;
    readonly example?: unknown;
    readonly examples?: Readonly<Record<string, Referenceable<Example>>>;
  }
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
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly requestBody?: unknown;
    readonly description?: string;
    readonly server?: Server;
  }
  export type Callback = Readonly<Record<string, PathItem>> & Extensions;

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
  export type SecurityRequirement = Readonly<Record<string, readonly string[]>>;
  export type SecurityScheme =
    | ApiKeySecurityScheme
    | HttpSecurityScheme
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

  export type Schema = SchemaObject | Reference;
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
  export interface Discriminator {
    readonly propertyName: string;
    readonly mapping?: Readonly<Record<string, string>>;
  }
  export interface XML extends Extensions {
    readonly name?: string;
    readonly namespace?: string;
    readonly prefix?: string;
    readonly attribute?: boolean;
    readonly wrapped?: boolean;
  }
}
