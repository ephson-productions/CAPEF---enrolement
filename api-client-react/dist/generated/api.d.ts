import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { AppUser, AppUserInput, AppUserUpdate, Arrondissement, BadgeResult, DashboardStats, Department, ErrorResponse, ExportMembersParams, ExportResult, GetRecentActivityParams, HealthStatus, ListArrondissementsParams, ListDepartmentsParams, ListMembersParams, ListUsersParams, Member, MemberInput, MemberListResponse, MemberSummary, MemberUpdate, ProvisionUserInput, Region, SyncInput, SyncResult, UploadInput, UploadResult } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMeUrl: () => string;
/**
 * @summary Get the authenticated user's profile and role
 */
export declare const getMe: (options?: RequestInit) => Promise<AppUser>;
export declare const getGetMeQueryKey: () => readonly ["/api/auth/me"];
export declare const getGetMeQueryOptions: <TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMeQueryResult = NonNullable<Awaited<ReturnType<typeof getMe>>>;
export type GetMeQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get the authenticated user's profile and role
 */
export declare function useGetMe<TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getProvisionUserUrl: () => string;
/**
 * @summary JIT-provision the Clerk user into the app DB on first login
 */
export declare const provisionUser: (provisionUserInput: ProvisionUserInput, options?: RequestInit) => Promise<AppUser>;
export declare const getProvisionUserMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof provisionUser>>, TError, {
        data: BodyType<ProvisionUserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof provisionUser>>, TError, {
    data: BodyType<ProvisionUserInput>;
}, TContext>;
export type ProvisionUserMutationResult = NonNullable<Awaited<ReturnType<typeof provisionUser>>>;
export type ProvisionUserMutationBody = BodyType<ProvisionUserInput>;
export type ProvisionUserMutationError = ErrorType<ErrorResponse>;
/**
* @summary JIT-provision the Clerk user into the app DB on first login
*/
export declare const useProvisionUser: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof provisionUser>>, TError, {
        data: BodyType<ProvisionUserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof provisionUser>>, TError, {
    data: BodyType<ProvisionUserInput>;
}, TContext>;
export declare const getListUsersUrl: (params?: ListUsersParams) => string;
/**
 * @summary List all app users (admin only)
 */
export declare const listUsers: (params?: ListUsersParams, options?: RequestInit) => Promise<AppUser[]>;
export declare const getListUsersQueryKey: (params?: ListUsersParams) => readonly ["/api/users", ...ListUsersParams[]];
export declare const getListUsersQueryOptions: <TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<ErrorResponse>>(params?: ListUsersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListUsersQueryResult = NonNullable<Awaited<ReturnType<typeof listUsers>>>;
export type ListUsersQueryError = ErrorType<ErrorResponse>;
/**
 * @summary List all app users (admin only)
 */
export declare function useListUsers<TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<ErrorResponse>>(params?: ListUsersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateUserUrl: () => string;
/**
 * @summary Create/invite a new user (admin only)
 */
export declare const createUser: (appUserInput: AppUserInput, options?: RequestInit) => Promise<AppUser>;
export declare const getCreateUserMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
        data: BodyType<AppUserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
    data: BodyType<AppUserInput>;
}, TContext>;
export type CreateUserMutationResult = NonNullable<Awaited<ReturnType<typeof createUser>>>;
export type CreateUserMutationBody = BodyType<AppUserInput>;
export type CreateUserMutationError = ErrorType<ErrorResponse>;
/**
* @summary Create/invite a new user (admin only)
*/
export declare const useCreateUser: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
        data: BodyType<AppUserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createUser>>, TError, {
    data: BodyType<AppUserInput>;
}, TContext>;
export declare const getGetUserUrl: (id: number) => string;
/**
 * @summary Get a single user
 */
export declare const getUser: (id: number, options?: RequestInit) => Promise<AppUser>;
export declare const getGetUserQueryKey: (id: number) => readonly [`/api/users/${number}`];
export declare const getGetUserQueryOptions: <TData = Awaited<ReturnType<typeof getUser>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUser>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getUser>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetUserQueryResult = NonNullable<Awaited<ReturnType<typeof getUser>>>;
export type GetUserQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a single user
 */
export declare function useGetUser<TData = Awaited<ReturnType<typeof getUser>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUser>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateUserUrl: (id: number) => string;
/**
 * @summary Update a user's role or region (admin only)
 */
export declare const updateUser: (id: number, appUserUpdate: AppUserUpdate, options?: RequestInit) => Promise<AppUser>;
export declare const getUpdateUserMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<AppUserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<AppUserUpdate>;
}, TContext>;
export type UpdateUserMutationResult = NonNullable<Awaited<ReturnType<typeof updateUser>>>;
export type UpdateUserMutationBody = BodyType<AppUserUpdate>;
export type UpdateUserMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update a user's role or region (admin only)
*/
export declare const useUpdateUser: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<AppUserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<AppUserUpdate>;
}, TContext>;
export declare const getDeleteUserUrl: (id: number) => string;
/**
 * @summary Delete a user (admin only)
 */
export declare const deleteUser: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteUserMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export type DeleteUserMutationResult = NonNullable<Awaited<ReturnType<typeof deleteUser>>>;
export type DeleteUserMutationError = ErrorType<ErrorResponse>;
/**
* @summary Delete a user (admin only)
*/
export declare const useDeleteUser: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export declare const getListRegionsUrl: () => string;
/**
 * @summary List all regions of Cameroon
 */
export declare const listRegions: (options?: RequestInit) => Promise<Region[]>;
export declare const getListRegionsQueryKey: () => readonly ["/api/regions"];
export declare const getListRegionsQueryOptions: <TData = Awaited<ReturnType<typeof listRegions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listRegions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listRegions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListRegionsQueryResult = NonNullable<Awaited<ReturnType<typeof listRegions>>>;
export type ListRegionsQueryError = ErrorType<unknown>;
/**
 * @summary List all regions of Cameroon
 */
export declare function useListRegions<TData = Awaited<ReturnType<typeof listRegions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listRegions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListDepartmentsUrl: (params?: ListDepartmentsParams) => string;
/**
 * @summary List departments, optionally filtered by region
 */
export declare const listDepartments: (params?: ListDepartmentsParams, options?: RequestInit) => Promise<Department[]>;
export declare const getListDepartmentsQueryKey: (params?: ListDepartmentsParams) => readonly ["/api/departments", ...ListDepartmentsParams[]];
export declare const getListDepartmentsQueryOptions: <TData = Awaited<ReturnType<typeof listDepartments>>, TError = ErrorType<unknown>>(params?: ListDepartmentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDepartments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listDepartments>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListDepartmentsQueryResult = NonNullable<Awaited<ReturnType<typeof listDepartments>>>;
export type ListDepartmentsQueryError = ErrorType<unknown>;
/**
 * @summary List departments, optionally filtered by region
 */
export declare function useListDepartments<TData = Awaited<ReturnType<typeof listDepartments>>, TError = ErrorType<unknown>>(params?: ListDepartmentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDepartments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListArrondissementsUrl: (params?: ListArrondissementsParams) => string;
/**
 * @summary List arrondissements, optionally filtered by department
 */
export declare const listArrondissements: (params?: ListArrondissementsParams, options?: RequestInit) => Promise<Arrondissement[]>;
export declare const getListArrondissementsQueryKey: (params?: ListArrondissementsParams) => readonly ["/api/arrondissements", ...ListArrondissementsParams[]];
export declare const getListArrondissementsQueryOptions: <TData = Awaited<ReturnType<typeof listArrondissements>>, TError = ErrorType<unknown>>(params?: ListArrondissementsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listArrondissements>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listArrondissements>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListArrondissementsQueryResult = NonNullable<Awaited<ReturnType<typeof listArrondissements>>>;
export type ListArrondissementsQueryError = ErrorType<unknown>;
/**
 * @summary List arrondissements, optionally filtered by department
 */
export declare function useListArrondissements<TData = Awaited<ReturnType<typeof listArrondissements>>, TError = ErrorType<unknown>>(params?: ListArrondissementsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listArrondissements>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListMembersUrl: (params?: ListMembersParams) => string;
/**
 * @summary List members with filters, search, and pagination
 */
export declare const listMembers: (params?: ListMembersParams, options?: RequestInit) => Promise<MemberListResponse>;
export declare const getListMembersQueryKey: (params?: ListMembersParams) => readonly ["/api/members", ...ListMembersParams[]];
export declare const getListMembersQueryOptions: <TData = Awaited<ReturnType<typeof listMembers>>, TError = ErrorType<unknown>>(params?: ListMembersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMembers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listMembers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListMembersQueryResult = NonNullable<Awaited<ReturnType<typeof listMembers>>>;
export type ListMembersQueryError = ErrorType<unknown>;
/**
 * @summary List members with filters, search, and pagination
 */
export declare function useListMembers<TData = Awaited<ReturnType<typeof listMembers>>, TError = ErrorType<unknown>>(params?: ListMembersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMembers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateMemberUrl: () => string;
/**
 * @summary Enroll a new member
 */
export declare const createMember: (memberInput: MemberInput, options?: RequestInit) => Promise<Member>;
export declare const getCreateMemberMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMember>>, TError, {
        data: BodyType<MemberInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createMember>>, TError, {
    data: BodyType<MemberInput>;
}, TContext>;
export type CreateMemberMutationResult = NonNullable<Awaited<ReturnType<typeof createMember>>>;
export type CreateMemberMutationBody = BodyType<MemberInput>;
export type CreateMemberMutationError = ErrorType<ErrorResponse>;
/**
* @summary Enroll a new member
*/
export declare const useCreateMember: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMember>>, TError, {
        data: BodyType<MemberInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createMember>>, TError, {
    data: BodyType<MemberInput>;
}, TContext>;
export declare const getExportMembersUrl: (params?: ExportMembersParams) => string;
/**
 * @summary Export members as CSV
 */
export declare const exportMembers: (params?: ExportMembersParams, options?: RequestInit) => Promise<ExportResult>;
export declare const getExportMembersQueryKey: (params?: ExportMembersParams) => readonly ["/api/members/export", ...ExportMembersParams[]];
export declare const getExportMembersQueryOptions: <TData = Awaited<ReturnType<typeof exportMembers>>, TError = ErrorType<unknown>>(params?: ExportMembersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof exportMembers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof exportMembers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ExportMembersQueryResult = NonNullable<Awaited<ReturnType<typeof exportMembers>>>;
export type ExportMembersQueryError = ErrorType<unknown>;
/**
 * @summary Export members as CSV
 */
export declare function useExportMembers<TData = Awaited<ReturnType<typeof exportMembers>>, TError = ErrorType<unknown>>(params?: ExportMembersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof exportMembers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMemberUrl: (id: number) => string;
/**
 * @summary Get a single member with all details
 */
export declare const getMember: (id: number, options?: RequestInit) => Promise<Member>;
export declare const getGetMemberQueryKey: (id: number) => readonly [`/api/members/${number}`];
export declare const getGetMemberQueryOptions: <TData = Awaited<ReturnType<typeof getMember>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMember>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMember>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMemberQueryResult = NonNullable<Awaited<ReturnType<typeof getMember>>>;
export type GetMemberQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a single member with all details
 */
export declare function useGetMember<TData = Awaited<ReturnType<typeof getMember>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMember>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateMemberUrl: (id: number) => string;
/**
 * @summary Update a member enrollment
 */
export declare const updateMember: (id: number, memberUpdate: MemberUpdate, options?: RequestInit) => Promise<Member>;
export declare const getUpdateMemberMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateMember>>, TError, {
        id: number;
        data: BodyType<MemberUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateMember>>, TError, {
    id: number;
    data: BodyType<MemberUpdate>;
}, TContext>;
export type UpdateMemberMutationResult = NonNullable<Awaited<ReturnType<typeof updateMember>>>;
export type UpdateMemberMutationBody = BodyType<MemberUpdate>;
export type UpdateMemberMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update a member enrollment
*/
export declare const useUpdateMember: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateMember>>, TError, {
        id: number;
        data: BodyType<MemberUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateMember>>, TError, {
    id: number;
    data: BodyType<MemberUpdate>;
}, TContext>;
export declare const getDeleteMemberUrl: (id: number) => string;
/**
 * @summary Delete a member enrollment
 */
export declare const deleteMember: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteMemberMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteMember>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteMember>>, TError, {
    id: number;
}, TContext>;
export type DeleteMemberMutationResult = NonNullable<Awaited<ReturnType<typeof deleteMember>>>;
export type DeleteMemberMutationError = ErrorType<ErrorResponse>;
/**
* @summary Delete a member enrollment
*/
export declare const useDeleteMember: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteMember>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteMember>>, TError, {
    id: number;
}, TContext>;
export declare const getGenerateBadgeUrl: (id: number) => string;
/**
 * @summary Generate a PDF badge with QR code for a member
 */
export declare const generateBadge: (id: number, options?: RequestInit) => Promise<BadgeResult>;
export declare const getGenerateBadgeMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof generateBadge>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof generateBadge>>, TError, {
    id: number;
}, TContext>;
export type GenerateBadgeMutationResult = NonNullable<Awaited<ReturnType<typeof generateBadge>>>;
export type GenerateBadgeMutationError = ErrorType<ErrorResponse>;
/**
* @summary Generate a PDF badge with QR code for a member
*/
export declare const useGenerateBadge: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof generateBadge>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof generateBadge>>, TError, {
    id: number;
}, TContext>;
export declare const getSyncMembersUrl: () => string;
/**
 * @summary Bulk-sync offline-created members
 */
export declare const syncMembers: (syncInput: SyncInput, options?: RequestInit) => Promise<SyncResult>;
export declare const getSyncMembersMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof syncMembers>>, TError, {
        data: BodyType<SyncInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof syncMembers>>, TError, {
    data: BodyType<SyncInput>;
}, TContext>;
export type SyncMembersMutationResult = NonNullable<Awaited<ReturnType<typeof syncMembers>>>;
export type SyncMembersMutationBody = BodyType<SyncInput>;
export type SyncMembersMutationError = ErrorType<unknown>;
/**
* @summary Bulk-sync offline-created members
*/
export declare const useSyncMembers: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof syncMembers>>, TError, {
        data: BodyType<SyncInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof syncMembers>>, TError, {
    data: BodyType<SyncInput>;
}, TContext>;
export declare const getGetDashboardStatsUrl: () => string;
/**
 * @summary Aggregated statistics for the dashboard
 */
export declare const getDashboardStats: (options?: RequestInit) => Promise<DashboardStats>;
export declare const getGetDashboardStatsQueryKey: () => readonly ["/api/dashboard/stats"];
export declare const getGetDashboardStatsQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardStats>>>;
export type GetDashboardStatsQueryError = ErrorType<unknown>;
/**
 * @summary Aggregated statistics for the dashboard
 */
export declare function useGetDashboardStats<TData = Awaited<ReturnType<typeof getDashboardStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetRecentActivityUrl: (params?: GetRecentActivityParams) => string;
/**
 * @summary Recent enrollment activity feed
 */
export declare const getRecentActivity: (params?: GetRecentActivityParams, options?: RequestInit) => Promise<MemberSummary[]>;
export declare const getGetRecentActivityQueryKey: (params?: GetRecentActivityParams) => readonly ["/api/dashboard/recent", ...GetRecentActivityParams[]];
export declare const getGetRecentActivityQueryOptions: <TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(params?: GetRecentActivityParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetRecentActivityQueryResult = NonNullable<Awaited<ReturnType<typeof getRecentActivity>>>;
export type GetRecentActivityQueryError = ErrorType<unknown>;
/**
 * @summary Recent enrollment activity feed
 */
export declare function useGetRecentActivity<TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(params?: GetRecentActivityParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUploadFileUrl: () => string;
/**
 * @summary Upload a photo or document (returns a stored URL)
 */
export declare const uploadFile: (uploadInput: UploadInput, options?: RequestInit) => Promise<UploadResult>;
export declare const getUploadFileMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof uploadFile>>, TError, {
        data: BodyType<UploadInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof uploadFile>>, TError, {
    data: BodyType<UploadInput>;
}, TContext>;
export type UploadFileMutationResult = NonNullable<Awaited<ReturnType<typeof uploadFile>>>;
export type UploadFileMutationBody = BodyType<UploadInput>;
export type UploadFileMutationError = ErrorType<ErrorResponse>;
/**
* @summary Upload a photo or document (returns a stored URL)
*/
export declare const useUploadFile: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof uploadFile>>, TError, {
        data: BodyType<UploadInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof uploadFile>>, TError, {
    data: BodyType<UploadInput>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map