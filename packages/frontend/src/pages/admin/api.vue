<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1100px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkInfo>API 管理只控制第三方应用、开发者 Token 和 OAuth/OIDC 接入，不影响站内前端正常登录和浏览。</MkInfo>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-adjustments"></i></template>
					<template #label>API 开放设置</template>
					<template #caption>{{ modeCaption }}</template>

					<div v-if="settings" class="_gaps_m">
						<MkInfo>OAuth/OIDC 回调地址由每个应用的所有者在开发者中心填写。管理员这里只控制 API 开放模式、审核和可申请权限。</MkInfo>

						<MkSelect v-model="settings.mode">
							<template #label>API 模式</template>
							<option value="approval">申请使用</option>
							<option value="open">开放使用</option>
							<option value="closed">关闭使用</option>
						</MkSelect>

						<div :class="$style.switchGrid">
							<MkSwitch v-model="settings.oauthEnabled">
								<template #label>启用 OAuth 登录</template>
								<template #caption>允许第三方网站用本站账号快捷登录。</template>
							</MkSwitch>
							<MkSwitch v-model="settings.oidcEnabled">
								<template #label>启用 OIDC UserInfo</template>
								<template #caption>开放 /.well-known/openid-configuration 和 /oauth/userinfo。</template>
							</MkSwitch>
							<MkSwitch v-model="settings.requireAppApproval">
								<template #label>新应用需要审核</template>
								<template #caption>开放使用模式下也可要求管理员审批应用。</template>
							</MkSwitch>
							<MkSwitch v-model="settings.allowDeveloperTokens">
								<template #label>允许个人开发者令牌</template>
								<template #caption>关闭后普通用户无法再创建个人 API 令牌，且现有个人令牌停止生效（管理员/root 不受限）。用于封堵第三方"API 中转"收割账号令牌。</template>
							</MkSwitch>
						</div>

						<div :class="$style.grid">
							<MkInput v-model="settings.defaultTokenRateLimit" type="number" :min="0">
								<template #label>默认 Token 限流 / 分钟</template>
							</MkInput>
							<MkInput v-model="settings.writeTokenRateLimit" type="number" :min="0">
								<template #label>写入接口限流 / 分钟</template>
							</MkInput>
						</div>

						<section :class="$style.permissionPanel" aria-labelledby="api-public-permissions-title">
							<div :class="$style.permissionHeader">
								<div>
									<div id="api-public-permissions-title" :class="$style.permissionTitle">允许普通开发者使用的权限范围</div>
									<div :class="$style.permissionCaption">权限范围已选择 {{ selectedPublicPermissionCount }} 项。普通开发者只能申请这里开放的 scope，admin 权限不会出现在公共选项里。</div>
								</div>
								<MkButton rounded small @click="restoreDefaultPublicPermissions">恢复推荐默认权限</MkButton>
							</div>

							<div :class="$style.permissionGroups">
								<section v-for="group in publicPermissionGroups" :key="group.key" :class="$style.permissionGroup">
									<div :class="$style.permissionGroupHeader">
										<div :class="$style.permissionGroupTitle">
											<i :class="group.icon"></i>
											<strong>{{ group.title }}</strong>
										</div>
										<div class="_buttons">
											<MkButton rounded small @click="selectPermissionGroup(group)">全选</MkButton>
											<MkButton rounded small @click="clearPermissionGroup(group)">清空</MkButton>
										</div>
									</div>
									<div :class="$style.permissionOptions">
										<button
											v-for="permission in group.permissions"
											:key="permission.scope"
											type="button"
											class="_button"
											:class="[$style.permissionOption, { [$style.permissionOptionActive]: isPermissionSelected(permission.scope) }]"
											:aria-pressed="isPermissionSelected(permission.scope)"
											@click="togglePermission(permission.scope)"
										>
											<span :class="$style.permissionCheck"><i :class="isPermissionSelected(permission.scope) ? 'ti ti-check' : 'ti ti-plus'"></i></span>
											<span :class="$style.permissionBody">
												<strong>{{ permission.label }}</strong>
												<code>{{ permission.scope }}</code>
												<small>{{ permission.description }}</small>
											</span>
										</button>
									</div>
								</section>

								<section v-if="unknownPublicPermissions.length > 0" :class="$style.permissionGroup">
									<div :class="$style.permissionGroupHeader">
										<div :class="$style.permissionGroupTitle">
											<i class="ti ti-dots"></i>
											<strong>其他权限</strong>
										</div>
									</div>
									<div :class="$style.permissionOptions">
										<button
											v-for="scope in unknownPublicPermissions"
											:key="scope"
											type="button"
											class="_button"
											:class="[$style.permissionOption, $style.permissionOptionActive]"
											aria-pressed="true"
											@click="togglePermission(scope)"
										>
											<span :class="$style.permissionCheck"><i class="ti ti-check"></i></span>
											<span :class="$style.permissionBody">
												<strong>保留未知权限</strong>
												<code>{{ scope }}</code>
												<small>后端返回的兼容 scope，保存时会继续保留；点击可从公共权限中移除。</small>
											</span>
										</button>
									</div>
								</section>
							</div>
						</section>

						<section :class="$style.permissionPanel" aria-labelledby="api-noapproval-permissions-title">
							<div :class="$style.permissionHeader">
								<div>
									<div id="api-noapproval-permissions-title" :class="$style.permissionTitle">免申请权限范围</div>
									<div :class="$style.permissionCaption">仅在「申请使用」模式下生效：已选 {{ selectedNoApprovalCount }} 项。当用户创建令牌/应用所请求的权限<strong>全部</strong>落在此范围内时，无需管理员审批即可使用；包含写入/敏感/admin 权限时仍需审批。</div>
								</div>
							</div>

							<div :class="$style.permissionGroups">
								<section v-for="group in publicPermissionGroups" :key="'na-' + group.key" :class="$style.permissionGroup">
									<div :class="$style.permissionGroupHeader">
										<div :class="$style.permissionGroupTitle">
											<i :class="group.icon"></i>
											<strong>{{ group.title }}</strong>
										</div>
										<div class="_buttons">
											<MkButton rounded small @click="selectNoApprovalGroup(group)">全选</MkButton>
											<MkButton rounded small @click="clearNoApprovalGroup(group)">清空</MkButton>
										</div>
									</div>
									<div :class="$style.permissionOptions">
										<button
											v-for="permission in group.permissions"
											:key="'na-' + permission.scope"
											type="button"
											class="_button"
											:class="[$style.permissionOption, { [$style.permissionOptionActive]: isNoApprovalSelected(permission.scope) }]"
											:aria-pressed="isNoApprovalSelected(permission.scope)"
											@click="toggleNoApproval(permission.scope)"
										>
											<span :class="$style.permissionCheck"><i :class="isNoApprovalSelected(permission.scope) ? 'ti ti-check' : 'ti ti-plus'"></i></span>
											<span :class="$style.permissionBody">
												<strong>{{ permission.label }}</strong>
												<code>{{ permission.scope }}</code>
												<small>{{ permission.description }}</small>
											</span>
										</button>
									</div>
								</section>
							</div>
						</section>

						<div class="_buttons">
							<MkButton primary rounded :wait="savingSettings" @click="saveSettings"><i class="ti ti-device-floppy"></i> 保存设置</MkButton>
							<MkButton rounded @click="reload"><i class="ti ti-refresh"></i> 刷新</MkButton>
						</div>
					</div>
				</MkFolder>

				<div v-if="summary" :class="$style.summaryGrid">
					<div :class="$style.metric"><span>待审申请</span><strong>{{ summary.accessRequests.pending }}</strong></div>
					<div :class="$style.metric"><span>待审应用</span><strong>{{ summary.apps.pending }}</strong></div>
					<div :class="$style.metric"><span>活跃 Token</span><strong>{{ summary.tokens.active }}</strong></div>
					<div :class="$style.metric"><span>已暂停应用</span><strong>{{ summary.apps.suspended }}</strong></div>
				</div>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-user-check"></i></template>
					<template #label>开发者申请</template>
					<template #caption>{{ accessRequestStatusFilterLabel }}</template>

					<div class="_gaps_s">
						<div :class="$style.listTools">
							<div :class="$style.filterGrid">
								<MkSelect v-model="accessRequestStatusFilter">
									<template #label>申请状态</template>
									<option value="pending">待审核</option>
									<option value="approved">已通过</option>
									<option value="rejected">已拒绝</option>
									<option value="suspended">已暂停</option>
									<option value="all">全部</option>
								</MkSelect>
								<MkInput v-model="accessRequestsState.queryInput" @keydown.enter.prevent="applyAccessRequestFilters">
									<template #label>关键词</template>
									<template #prefix><i class="ti ti-search"></i></template>
								</MkInput>
								<MkInput v-model="accessRequestsState.userIdInput" @keydown.enter.prevent="applyAccessRequestFilters">
									<template #label>用户 ID</template>
									<template #prefix><i class="ti ti-user"></i></template>
								</MkInput>
							</div>
							<div class="_buttons">
								<MkButton rounded primary @click="applyAccessRequestFilters()"><i class="ti ti-search"></i> 查询</MkButton>
								<MkButton rounded :disabled="!accessRequestFilterActive" @click="clearAccessRequestFilters()"><i class="ti ti-x"></i> 清空</MkButton>
								<MkButton rounded :wait="accessRequestsState.loading" @click="loadAccessRequests()"><i class="ti ti-refresh"></i> 刷新</MkButton>
							</div>
						</div>

						<div v-if="accessRequestsState.loading" :class="$style.loading"><MkLoading/></div>
						<div v-else-if="accessRequestsState.error" :class="$style.listError">
							<span>开发者申请加载失败。</span>
							<MkButton rounded small @click="loadAccessRequests()">重试</MkButton>
						</div>
						<div v-else-if="accessRequestsState.items.length === 0" :class="$style.empty">暂无开发者申请。</div>
						<div v-else class="_gaps_s">
							<div v-for="request in accessRequestsState.items" :key="request.id" :class="$style.item">
								<div :class="$style.itemBody">
									<div :class="$style.itemHeader">
										<strong>{{ userDisplayName(request.user) }}</strong>
										<span :class="[$style.statusBadge, statusBadgeClass(request.status)]">{{ statusLabel(request.status) }}</span>
									</div>
									<div :class="$style.meta">申请人：<span class="_monospace">{{ userAcctLabel(request.user) }}</span> · 用户 ID：<span class="_monospace">{{ request.user?.id ?? '未知' }}</span></div>
									<div :class="$style.meta">申请 ID：<span class="_monospace">{{ request.id }}</span></div>
									<div :class="$style.meta">更新时间：{{ request.updatedAt }}</div>
									<div :class="$style.meta">{{ request.reason || '无申请说明' }}</div>
								</div>
								<div class="_buttons">
									<MkButton v-if="request.status !== 'approved'" rounded primary :wait="isReviewingAccess(request.id, 'approve')" @click="reviewAccess(request.id, 'approve')">通过</MkButton>
									<MkButton v-if="request.status !== 'rejected'" rounded :wait="isReviewingAccess(request.id, 'reject')" @click="reviewAccess(request.id, 'reject')">拒绝</MkButton>
									<MkButton v-if="request.status !== 'suspended'" rounded danger :wait="isReviewingAccess(request.id, 'suspend')" @click="reviewAccess(request.id, 'suspend')">暂停</MkButton>
								</div>
							</div>
						</div>

						<div v-if="!accessRequestsState.loading && !accessRequestsState.error" :class="$style.pager">
							<div :class="$style.pagerSummary">共 {{ accessRequestsState.total }} 条，第 {{ accessRequestsState.page }} / {{ pageCount(accessRequestsState) }} 页<span v-if="accessRequestsState.total > 0">，当前 {{ pageRangeStart(accessRequestsState) }}-{{ pageRangeEnd(accessRequestsState) }} 条</span></div>
							<div :class="$style.pagerControls">
								<MkSelect :modelValue="accessRequestsState.pageSize" small @update:modelValue="(value) => setPageSize(accessRequestsState, loadAccessRequests, value)">
									<template #label>每页数量</template>
									<option v-for="size in pageSizeValues" :key="size" :value="size">{{ size }}</option>
								</MkSelect>
								<MkInput v-model="accessRequestsState.pageInput" type="number" :min="1" :max="pageCount(accessRequestsState)" @keydown.enter.prevent="jumpToPage(accessRequestsState, loadAccessRequests)">
									<template #label>跳页</template>
								</MkInput>
								<div class="_buttons" :class="$style.pageButtons">
									<MkButton rounded small @click="jumpToPage(accessRequestsState, loadAccessRequests)">跳转</MkButton>
									<MkButton rounded small :disabled="accessRequestsState.page <= 1" @click="goToPage(accessRequestsState, loadAccessRequests, 1)">首页</MkButton>
									<MkButton rounded small :disabled="accessRequestsState.page <= 1" @click="goToPage(accessRequestsState, loadAccessRequests, accessRequestsState.page - 1)">上一页</MkButton>
									<MkButton rounded small :disabled="accessRequestsState.page >= pageCount(accessRequestsState)" @click="goToPage(accessRequestsState, loadAccessRequests, accessRequestsState.page + 1)">下一页</MkButton>
									<MkButton rounded small :disabled="accessRequestsState.page >= pageCount(accessRequestsState)" @click="goToPage(accessRequestsState, loadAccessRequests, pageCount(accessRequestsState))">末页</MkButton>
									</div>
							</div>
						</div>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-apps"></i></template>
					<template #label>OAuth 应用</template>
					<template #caption>{{ appStatusFilterLabel }}</template>

					<div class="_gaps_s">
						<div :class="$style.listTools">
							<div :class="$style.filterGrid">
								<MkSelect v-model="appStatusFilter">
									<template #label>应用状态</template>
									<option value="pending">待审核</option>
									<option value="approved">已通过</option>
									<option value="suspended">已暂停</option>
									<option value="rejected">已拒绝</option>
									<option value="all">全部</option>
								</MkSelect>
								<MkInput v-model="appsState.queryInput" @keydown.enter.prevent="applyAppFilters">
									<template #label>关键词</template>
									<template #prefix><i class="ti ti-search"></i></template>
								</MkInput>
								<MkInput v-model="appsState.userIdInput" @keydown.enter.prevent="applyAppFilters">
									<template #label>用户 ID</template>
									<template #prefix><i class="ti ti-user"></i></template>
								</MkInput>
							</div>
							<div class="_buttons">
								<MkButton rounded primary @click="applyAppFilters()"><i class="ti ti-search"></i> 查询</MkButton>
								<MkButton rounded :disabled="!appFilterActive" @click="clearAppFilters()"><i class="ti ti-x"></i> 清空</MkButton>
								<MkButton rounded :wait="appsState.loading" @click="loadApps()"><i class="ti ti-refresh"></i> 刷新</MkButton>
								<MkButton rounded danger @click="cleanOwnerlessApps()"><i class="ti ti-trash"></i> 一键清理无主应用</MkButton>
							</div>
						</div>

						<div v-if="appsState.loading" :class="$style.loading"><MkLoading/></div>
						<div v-else-if="appsState.error" :class="$style.listError">
							<span>OAuth 应用加载失败。</span>
							<MkButton rounded small @click="loadApps()">重试</MkButton>
						</div>
						<div v-else-if="appsState.items.length === 0" :class="$style.empty">暂无应用。</div>
						<div v-else class="_gaps_s">
							<div v-for="app in appsState.items" :key="app.id" :class="$style.item">
								<div :class="$style.itemBody">
									<div :class="$style.itemHeader">
										<strong>{{ app.name }}</strong>
										<span :class="[$style.statusBadge, statusBadgeClass(app.status)]">{{ statusLabel(app.status) }}</span>
									</div>
									<div :class="$style.meta">申请人：<span class="_monospace">{{ userDisplayName(app.user) }}</span> · <span class="_monospace">{{ userAcctLabel(app.user) }}</span> · 用户 ID：<span class="_monospace">{{ app.user?.id ?? '无所有者' }}</span></div>
									<div :class="$style.meta">应用 ID：<span class="_monospace">{{ app.id }}</span></div>
									<div :class="$style.meta">权限：{{ (app.permission ?? []).join(', ') || '无' }}</div>
									<div :class="$style.meta">回调：{{ (app.callbackUrls ?? [app.callbackUrl]).filter(Boolean).join(', ') || '未设置' }}</div>
								</div>
								<div class="_buttons">
									<MkButton v-if="app.status !== 'approved'" rounded primary :wait="isReviewingApp(app.id, 'approve')" @click="reviewApp(app.id, 'approve')">通过</MkButton>
									<MkButton v-if="app.status !== 'rejected' && app.status !== 'suspended'" rounded :wait="isReviewingApp(app.id, 'reject')" @click="reviewApp(app.id, 'reject')">拒绝</MkButton>
									<MkButton rounded danger :wait="isReviewingApp(app.id, app.status === 'suspended' ? 'unsuspend' : 'suspend')" @click="reviewApp(app.id, app.status === 'suspended' ? 'unsuspend' : 'suspend')">{{ app.status === 'suspended' ? '恢复' : '暂停' }}</MkButton>
									<MkButton rounded danger :wait="deletingAppId === app.id" @click="deleteApp(app.id)">删除</MkButton>
								</div>
							</div>
						</div>

						<div v-if="!appsState.loading && !appsState.error" :class="$style.pager">
							<div :class="$style.pagerSummary">共 {{ appsState.total }} 条，第 {{ appsState.page }} / {{ pageCount(appsState) }} 页<span v-if="appsState.total > 0">，当前 {{ pageRangeStart(appsState) }}-{{ pageRangeEnd(appsState) }} 条</span></div>
							<div :class="$style.pagerControls">
								<MkSelect :modelValue="appsState.pageSize" small @update:modelValue="(value) => setPageSize(appsState, loadApps, value)">
									<template #label>每页数量</template>
									<option v-for="size in pageSizeValues" :key="size" :value="size">{{ size }}</option>
								</MkSelect>
								<MkInput v-model="appsState.pageInput" type="number" :min="1" :max="pageCount(appsState)" @keydown.enter.prevent="jumpToPage(appsState, loadApps)">
									<template #label>跳页</template>
								</MkInput>
								<div class="_buttons" :class="$style.pageButtons">
									<MkButton rounded small @click="jumpToPage(appsState, loadApps)">跳转</MkButton>
									<MkButton rounded small :disabled="appsState.page <= 1" @click="goToPage(appsState, loadApps, 1)">首页</MkButton>
									<MkButton rounded small :disabled="appsState.page <= 1" @click="goToPage(appsState, loadApps, appsState.page - 1)">上一页</MkButton>
									<MkButton rounded small :disabled="appsState.page >= pageCount(appsState)" @click="goToPage(appsState, loadApps, appsState.page + 1)">下一页</MkButton>
									<MkButton rounded small :disabled="appsState.page >= pageCount(appsState)" @click="goToPage(appsState, loadApps, pageCount(appsState))">末页</MkButton>
									</div>
							</div>
						</div>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-key"></i></template>
					<template #label>个人 API Token</template>
					<template #caption>{{ tokenStatusFilterLabel }}</template>

					<div class="_gaps_s">
						<div :class="$style.listTools">
							<div :class="$style.filterGrid">
								<MkSelect v-model="tokenStatusFilter">
									<template #label>Token 状态</template>
									<option value="active">活跃</option>
									<option value="suspended">已暂停</option>
									<option value="revoked">已撤销</option>
									<option value="all">全部</option>
								</MkSelect>
								<MkInput v-model="tokensState.queryInput" @keydown.enter.prevent="applyTokenFilters">
									<template #label>关键词</template>
									<template #prefix><i class="ti ti-search"></i></template>
								</MkInput>
								<MkInput v-model="tokensState.userIdInput" @keydown.enter.prevent="applyTokenFilters">
									<template #label>用户 ID</template>
									<template #prefix><i class="ti ti-user"></i></template>
								</MkInput>
							</div>
							<div class="_buttons">
								<MkButton rounded primary @click="applyTokenFilters()"><i class="ti ti-search"></i> 查询</MkButton>
								<MkButton rounded :disabled="!tokenFilterActive" @click="clearTokenFilters()"><i class="ti ti-x"></i> 清空</MkButton>
								<MkButton rounded :wait="tokensState.loading" @click="loadTokens()"><i class="ti ti-refresh"></i> 刷新</MkButton>
								<MkButton rounded danger :disabled="!tokenFilterActive" @click="bulkRevokeFilteredTokens()"><i class="ti ti-ban"></i> 批量撤销筛选结果</MkButton>
							</div>
						</div>

						<div v-if="tokensState.loading" :class="$style.loading"><MkLoading/></div>
						<div v-else-if="tokensState.error" :class="$style.listError">
							<span>个人 API Token 加载失败。</span>
							<MkButton rounded small @click="loadTokens()">重试</MkButton>
						</div>
						<div v-else-if="tokensState.items.length === 0" :class="$style.empty">暂无开发者 Token。</div>
						<div v-else class="_gaps_s">
							<div v-for="token in tokensState.items" :key="token.id" :class="$style.item">
								<div :class="$style.itemBody">
									<div :class="$style.itemHeader">
										<strong>{{ token.name || token.id }}</strong>
										<span :class="[$style.statusBadge, statusBadgeClass(token.status)]">{{ statusLabel(token.status) }}</span>
									</div>
									<div :class="$style.meta">持有人：<span class="_monospace">{{ userDisplayName(token.user) }}</span> · <span class="_monospace">{{ userAcctLabel(token.user) }}</span> · 用户 ID：<span class="_monospace">{{ token.user?.id ?? '未知' }}</span></div>
									<div :class="$style.meta">Token ID：<span class="_monospace">{{ token.id }}</span></div>
									<div v-if="token.description" :class="$style.meta">说明：{{ token.description }}</div>
									<div :class="$style.meta">权限：{{ (token.permission ?? []).join(', ') || '无' }}</div>
									<div :class="$style.tokenMetaGrid">
										<span>创建：{{ token.createdAt }}</span>
										<span>最近使用：{{ token.lastUsedAt ?? '无记录' }}</span>
										<span>等级：{{ token.rank ?? '跟随用户' }}</span>
										<span>限流：{{ token.rateLimitPerMinute ?? '默认' }}</span>
										<span v-if="token.appName">应用：{{ token.appName }}</span>
									</div>
								</div>
								<div class="_buttons">
									<MkButton rounded @click="editTokenPermission(token)"><i class="ti ti-pencil"></i> 编辑权限</MkButton>
									<MkButton v-if="token.status !== 'suspended' && token.status !== 'revoked'" rounded danger :wait="suspendingTokenId === token.id" @click="suspendToken(token.id)">暂停</MkButton>
									<MkButton v-if="token.status !== 'revoked'" rounded danger :wait="revokingTokenId === token.id" @click="revokeToken(token.id)">撤销</MkButton>
								</div>
							</div>
						</div>

						<div v-if="!tokensState.loading && !tokensState.error" :class="$style.pager">
							<div :class="$style.pagerSummary">共 {{ tokensState.total }} 条，第 {{ tokensState.page }} / {{ pageCount(tokensState) }} 页<span v-if="tokensState.total > 0">，当前 {{ pageRangeStart(tokensState) }}-{{ pageRangeEnd(tokensState) }} 条</span></div>
							<div :class="$style.pagerControls">
								<MkSelect :modelValue="tokensState.pageSize" small @update:modelValue="(value) => setPageSize(tokensState, loadTokens, value)">
									<template #label>每页数量</template>
									<option v-for="size in pageSizeValues" :key="size" :value="size">{{ size }}</option>
								</MkSelect>
								<MkInput v-model="tokensState.pageInput" type="number" :min="1" :max="pageCount(tokensState)" @keydown.enter.prevent="jumpToPage(tokensState, loadTokens)">
									<template #label>跳页</template>
								</MkInput>
								<div class="_buttons" :class="$style.pageButtons">
									<MkButton rounded small @click="jumpToPage(tokensState, loadTokens)">跳转</MkButton>
									<MkButton rounded small :disabled="tokensState.page <= 1" @click="goToPage(tokensState, loadTokens, 1)">首页</MkButton>
									<MkButton rounded small :disabled="tokensState.page <= 1" @click="goToPage(tokensState, loadTokens, tokensState.page - 1)">上一页</MkButton>
									<MkButton rounded small :disabled="tokensState.page >= pageCount(tokensState)" @click="goToPage(tokensState, loadTokens, tokensState.page + 1)">下一页</MkButton>
									<MkButton rounded small :disabled="tokensState.page >= pageCount(tokensState)" @click="goToPage(tokensState, loadTokens, pageCount(tokensState))">末页</MkButton>
								</div>
							</div>
						</div>
					</div>
				</MkFolder>
			</div>
		</FormSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, useCssModule, watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSuspense from '@/components/form/suspense.vue';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type ApiSettings = {
	mode: 'approval' | 'open' | 'closed';
	oauthEnabled: boolean;
	oidcEnabled: boolean;
	requireAppApproval: boolean;
	publicPermissions: string[];
	noApprovalPermissions: string[];
	allowDeveloperTokens: boolean;
	defaultTokenRateLimit: number;
	writeTokenRateLimit: number;
};

type PackedUser = {
	id: string;
	username: string;
	name?: string | null;
	host?: string | null;
};

type ApiAccessStatusValue = 'pending' | 'approved' | 'rejected' | 'suspended';
type ApiAppStatusValue = 'pending' | 'approved' | 'rejected' | 'suspended';
type ApiTokenStatusValue = 'active' | 'suspended' | 'revoked';
type FilterStatus<T extends string> = T | 'all';
type ReviewAction = 'approve' | 'reject' | 'suspend' | 'unsuspend';

type ApiAccessRequest = {
	id: string;
	status: ApiAccessStatusValue;
	reason: string | null;
	reviewNote: string | null;
	updatedAt: string;
	user: PackedUser | null;
};

type ApiApp = {
	id: string;
	name: string;
	status: ApiAppStatusValue;
	callbackUrl: string | null;
	callbackUrls?: string[];
	permission: string[];
	user: PackedUser | null;
};

type ApiToken = {
	id: string;
	name: string | null;
	description: string | null;
	createdAt: string;
	lastUsedAt: string | null;
	status: ApiTokenStatusValue;
	permission: string[];
	rank: string | null;
	rateLimitPerMinute: number | null;
	appId: string | null;
	appName: string | null;
	user: PackedUser | null;
};

type ApiSummary = {
	accessRequests: { pending: number; approved: number; };
	apps: { pending: number; approved: number; suspended: number; };
	tokens: { active: number; suspended: number; revoked: number; };
};

type PageSize = '20' | '50' | '100';
type AdminListEndpoint = 'admin/api/access-requests/list' | 'admin/api/apps/list' | 'admin/api/tokens/list';
type ApiPagedResult<T> = {
	items?: T[];
	total?: number;
} | T[];
type NormalizedPagedResult<T> = {
	items: T[];
	total: number;
};
type PagedListState<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: PageSize;
	pageInput: string;
	query: string;
	queryInput: string;
	userId: string;
	userIdInput: string;
	loading: boolean;
	error: boolean;
};
type LoadListOptions = {
	resetPage?: boolean;
};
type LoadListFn = (options?: LoadListOptions) => Promise<void>;

type PermissionOption = {
	scope: string;
	label: string;
	description: string;
};

type PermissionGroup = {
	key: string;
	title: string;
	icon: string;
	permissions: PermissionOption[];
};

const publicPermissionGroups = [
	{
		key: 'account',
		title: '登录资料',
		icon: 'ti ti-user-circle',
		permissions: [
			{ scope: 'read:profile', label: '快捷登录资料', description: '仅用于 OAuth/OIDC userinfo，返回用户 ID、昵称、头像和主页链接。' },
			{ scope: 'read:account', label: '读取账号 API 资料', description: '允许调用 /api/i 等账号接口，可能返回更多账号设置；只给可信开发者开放。' },
		],
	},
	{
		key: 'notes',
		title: '发帖/删帖',
		icon: 'ti ti-message-circle',
		permissions: [
			{ scope: 'write:notes', label: '发布与删除帖子', description: '允许创建帖子，并删除当前用户有权限删除的帖子。' },
		],
	},
	{
		key: 'drive',
		title: '附件上传',
		icon: 'ti ti-cloud-upload',
		permissions: [
			{ scope: 'read:drive', label: '读取云盘文件', description: '读取当前用户云盘文件和附件元数据。' },
			{ scope: 'write:drive', label: '上传与管理文件', description: '上传附件、编辑文件信息或删除用户自己的文件。' },
		],
	},
	{
		key: 'channels',
		title: '频道资源',
		icon: 'ti ti-speakerphone',
		permissions: [
			{ scope: 'read:channels', label: '读取频道', description: '读取频道资料、频道帖子和资源列表。' },
			{ scope: 'write:channels', label: '管理频道内容', description: '发布频道内容或按用户权限维护频道资源。' },
		],
	},
	{
		key: 'following',
		title: '社交关系',
		icon: 'ti ti-users',
		permissions: [
			{ scope: 'read:following', label: '读取关注关系', description: '读取当前用户的关注、粉丝和社交关系。' },
			{ scope: 'write:following', label: '修改关注关系', description: '代表当前用户关注或取消关注其他账号。' },
		],
	},
	{
		key: 'moderation',
		title: '屏蔽/静音',
		icon: 'ti ti-shield',
		permissions: [
			{ scope: 'read:blocks', label: '读取屏蔽列表', description: '读取当前用户屏蔽的账号列表。' },
			{ scope: 'write:blocks', label: '修改屏蔽列表', description: '代表当前用户屏蔽或解除屏蔽账号。' },
			{ scope: 'read:mutes', label: '读取静音列表', description: '读取当前用户静音的账号或关键词。' },
			{ scope: 'write:mutes', label: '修改静音列表', description: '代表当前用户添加或解除静音规则。' },
		],
	},
	{
		key: 'notifications',
		title: '通知',
		icon: 'ti ti-bell',
		permissions: [
			{ scope: 'read:notifications', label: '读取通知', description: '读取当前用户收到的通知和未读状态。' },
			{ scope: 'write:notifications', label: '管理通知', description: '标记通知已读或清理通知状态。' },
		],
	},
	{
		key: 'chat',
		title: '聊天',
		icon: 'ti ti-messages',
		permissions: [
			{ scope: 'read:chat', label: '读取聊天', description: '读取当前用户可访问的聊天房间和消息。' },
			{ scope: 'write:chat', label: '发送聊天消息', description: '代表当前用户发送聊天消息或维护聊天状态。' },
		],
	},
] satisfies PermissionGroup[];

const recommendedPublicPermissions = [
	'read:profile',
	'write:notes',
	'read:drive',
	'write:drive',
	'read:channels',
	'write:channels',
	'read:following',
	'write:following',
	'read:blocks',
	'write:blocks',
	'read:mutes',
	'write:mutes',
	'read:notifications',
	'write:notifications',
	'read:chat',
	'write:chat',
];
const knownPublicPermissionScopes = new Set(publicPermissionGroups.flatMap(group => group.permissions.map(permission => permission.scope)));
const pageSizeValues = ['20', '50', '100'] satisfies PageSize[];

const settings = ref<ApiSettings | null>(null);
const summary = ref<ApiSummary | null>(null);
const styles = useCssModule();
const savingSettings = ref(false);
const reviewingAccess = ref<string | null>(null);
const reviewingApp = ref<string | null>(null);
const deletingAppId = ref<string | null>(null);
const suspendingTokenId = ref<string | null>(null);
const revokingTokenId = ref<string | null>(null);
const accessRequestStatusFilter = ref<FilterStatus<ApiAccessStatusValue>>('pending');
const appStatusFilter = ref<FilterStatus<ApiAppStatusValue>>('pending');
const tokenStatusFilter = ref<FilterStatus<ApiTokenStatusValue>>('active');
const accessRequestsState = createPagedListState<ApiAccessRequest>();
const appsState = createPagedListState<ApiApp>();
const tokensState = createPagedListState<ApiToken>();

const modeCaption = computed(() => ({
	approval: '申请使用',
	open: '开放使用',
	closed: '关闭使用',
}[settings.value?.mode ?? 'open']));

const selectedPublicPermissionCount = computed(() => settings.value?.publicPermissions.length ?? 0);
const unknownPublicPermissions = computed(() => (settings.value?.publicPermissions ?? []).filter(scope => !knownPublicPermissionScopes.has(scope) && !isAdminScope(scope)));
const accessRequestStatusFilterLabel = computed(() => adminListCaption(accessRequestStatusFilter.value, accessRequestsState));
const appStatusFilterLabel = computed(() => adminListCaption(appStatusFilter.value, appsState));
const tokenStatusFilterLabel = computed(() => {
	return adminListCaption(tokenStatusFilter.value, tokensState);
});
const accessRequestFilterActive = computed(() => hasPagedListFilter(accessRequestsState));
const appFilterActive = computed(() => hasPagedListFilter(appsState));
const tokenFilterActive = computed(() => hasPagedListFilter(tokensState));

async function init() {
	await Promise.all([
		reloadAdminData(),
		loadAccessRequests({ resetPage: true }),
		loadApps({ resetPage: true }),
		loadTokens({ resetPage: true }),
	]);
}

async function reload() {
	await Promise.all([
		reloadAdminData(),
		loadAccessRequests(),
		loadApps(),
		loadTokens(),
	]);
}

async function reloadAdminData() {
	const [settingsResult, summaryResult] = await Promise.all([
		misskeyApi<ApiSettings>('admin/api/settings/show', {}),
		misskeyApi<ApiSummary>('admin/api/usage/summary', {}),
	]);
	settings.value = {
		...settingsResult,
		publicPermissions: normalizePublicPermissionSelection(settingsResult.publicPermissions),
		noApprovalPermissions: normalizePublicPermissionSelection(settingsResult.noApprovalPermissions ?? []),
		allowDeveloperTokens: settingsResult.allowDeveloperTokens ?? true,
	};
	summary.value = summaryResult;
}

async function saveSettings() {
	if (!settings.value) return;
	savingSettings.value = true;
	try {
		settings.value = await misskeyApi<ApiSettings>('admin/api/settings/update', {
			...settings.value,
			publicPermissions: normalizePublicPermissionSelection(settings.value.publicPermissions),
			noApprovalPermissions: normalizePublicPermissionSelection(settings.value.noApprovalPermissions),
		});
		settings.value.publicPermissions = normalizePublicPermissionSelection(settings.value.publicPermissions);
		settings.value.noApprovalPermissions = normalizePublicPermissionSelection(settings.value.noApprovalPermissions ?? []);
		os.toast('API 设置已保存');
		await reload();
	} finally {
		savingSettings.value = false;
	}
}

function normalizePublicPermissionSelection(scopes: string[]): string[] {
	return Array.from(new Set(scopes.map(scope => scope.trim()).filter(scope => scope.length > 0 && !isAdminScope(scope))));
}

function isAdminScope(scope: string): boolean {
	return scope.startsWith('admin:') || scope.startsWith('read:admin:') || scope.startsWith('write:admin:');
}

function setPublicPermissions(scopes: string[]) {
	if (!settings.value) return;
	settings.value.publicPermissions = normalizePublicPermissionSelection(scopes);
}

function isPermissionSelected(scope: string): boolean {
	return settings.value?.publicPermissions.includes(scope) ?? false;
}

function togglePermission(scope: string) {
	if (!settings.value || isAdminScope(scope)) return;
	if (isPermissionSelected(scope)) {
		setPublicPermissions(settings.value.publicPermissions.filter(permission => permission !== scope));
	} else {
		setPublicPermissions([...settings.value.publicPermissions, scope]);
	}
}

function selectPermissionGroup(group: PermissionGroup) {
	if (!settings.value) return;
	setPublicPermissions([
		...settings.value.publicPermissions,
		...group.permissions.map(permission => permission.scope),
	]);
}

function clearPermissionGroup(group: PermissionGroup) {
	if (!settings.value) return;
	const groupScopes = new Set(group.permissions.map(permission => permission.scope));
	setPublicPermissions(settings.value.publicPermissions.filter(scope => !groupScopes.has(scope)));
}

function restoreDefaultPublicPermissions() {
	setPublicPermissions(recommendedPublicPermissions);
}

// ===== 免申请权限白名单（与公共权限面板共用 catalog，但绑定到 noApprovalPermissions）=====
const selectedNoApprovalCount = computed(() => settings.value?.noApprovalPermissions.length ?? 0);

function setNoApprovalPermissions(scopes: string[]) {
	if (!settings.value) return;
	settings.value.noApprovalPermissions = normalizePublicPermissionSelection(scopes);
}

function isNoApprovalSelected(scope: string): boolean {
	return settings.value?.noApprovalPermissions.includes(scope) ?? false;
}

function toggleNoApproval(scope: string) {
	if (!settings.value || isAdminScope(scope)) return;
	if (isNoApprovalSelected(scope)) {
		setNoApprovalPermissions(settings.value.noApprovalPermissions.filter(p => p !== scope));
	} else {
		setNoApprovalPermissions([...settings.value.noApprovalPermissions, scope]);
	}
}

function selectNoApprovalGroup(group: PermissionGroup) {
	if (!settings.value) return;
	setNoApprovalPermissions([...settings.value.noApprovalPermissions, ...group.permissions.map(p => p.scope)]);
}

function clearNoApprovalGroup(group: PermissionGroup) {
	if (!settings.value) return;
	const groupScopes = new Set(group.permissions.map(p => p.scope));
	setNoApprovalPermissions(settings.value.noApprovalPermissions.filter(scope => !groupScopes.has(scope)));
}

async function reviewAccess(id: string, action: 'approve' | 'reject' | 'suspend') {
	const key = actionKey(id, action);
	if (reviewingAccess.value) return;
	reviewingAccess.value = key;
	try {
		await os.apiWithDialog(`admin/api/access-requests/${action}`, { id });
		os.toast(`已${actionLabel(action)}申请`);
		await Promise.all([
			reloadAdminData(),
			loadAccessRequests(),
		]);
	} finally {
		reviewingAccess.value = null;
	}
}

async function reviewApp(appId: string, action: 'approve' | 'reject' | 'suspend' | 'unsuspend') {
	const key = actionKey(appId, action);
	if (reviewingApp.value) return;
	reviewingApp.value = key;
	try {
		await os.apiWithDialog(`admin/api/apps/${action}`, { appId });
		os.toast(`已${actionLabel(action)}应用`);
		await Promise.all([
			reloadAdminData(),
			loadApps(),
		]);
	} finally {
		reviewingApp.value = null;
	}
}

async function bulkRevokeFilteredTokens() {
	const name = tokensState.query.trim() || undefined;
	const userId = tokensState.userId.trim() || undefined;
	if (name == null && userId == null) {
		os.alert({ type: 'warning', text: '请先用上方「名称 / 用户ID」筛选后，再批量撤销当前结果。' });
		return;
	}
	const { canceled } = await os.confirm({
		type: 'warning',
		text: `确认撤销所有匹配（名称含「${name ?? '*'}」/ 用户「${userId ?? '*'}」）的开发者令牌？此操作不可逆。`,
	});
	if (canceled) return;
	const res = await os.apiWithDialog('admin/api/tokens/revoke-bulk', { name, userId });
	os.toast(`已撤销 ${res.revoked} 个令牌`);
	await loadTokens();
}

async function editTokenPermission(token: ApiToken) {
	const { canceled, result } = await os.inputText({
		title: '编辑令牌权限',
		text: '用英文逗号分隔多个 scope（如 read:account, write:notes）。admin scope 会被忽略；留空表示无权限。',
		default: token.permission.join(', '),
	});
	if (canceled || result == null) return;
	const permission = result.split(',').map(s => s.trim()).filter(s => s.length > 0);
	await os.apiWithDialog('admin/api/tokens/update', { tokenId: token.id, permission });
	os.toast('已更新令牌权限');
	await loadTokens();
}

async function cleanOwnerlessApps() {
	const listed = await misskeyApi('admin/api/apps/list', { ownerless: true, withTotal: true, limit: 1 });
	const total = Array.isArray(listed) ? listed.length : (listed.total ?? 0);
	if (total === 0) {
		os.alert({ type: 'info', text: '没有无主应用。' });
		return;
	}
	const { canceled } = await os.confirm({
		type: 'warning',
		text: `检测到 ${total} 个「无主（owner 已删除）」应用，确认全部删除并撤销其令牌？此操作不可逆。`,
	});
	if (canceled) return;
	const res = await os.apiWithDialog('admin/api/apps/delete-bulk', { ownerless: true });
	os.toast(`已清理 ${res.deleted} 个无主应用`);
	await loadApps();
}

async function deleteApp(appId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: '删除应用？',
		text: '应用删除后关联 Token 会被撤销。',
	});
	if (canceled) return;
	deletingAppId.value = appId;
	try {
		await os.apiWithDialog('admin/api/apps/delete', { appId });
		os.toast('已删除应用');
		await Promise.all([
			reloadAdminData(),
			loadApps(),
		]);
	} finally {
		deletingAppId.value = null;
	}
}

async function suspendToken(tokenId: string) {
	if (suspendingTokenId.value) return;
	suspendingTokenId.value = tokenId;
	try {
		await os.apiWithDialog('admin/api/tokens/suspend', { tokenId });
		os.toast('已暂停 Token');
		await Promise.all([
			reloadAdminData(),
			loadTokens(),
		]);
	} finally {
		suspendingTokenId.value = null;
	}
}

async function revokeToken(tokenId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: '撤销 Token？',
		text: '撤销后第三方程序会立即失效。',
	});
	if (canceled) return;
	revokingTokenId.value = tokenId;
	try {
		await os.apiWithDialog('admin/api/tokens/revoke', { tokenId });
		os.toast('已撤销 Token');
		await Promise.all([
			reloadAdminData(),
			loadTokens(),
		]);
	} finally {
		revokingTokenId.value = null;
	}
}

function createPagedListState<T>(): PagedListState<T> {
	return reactive({
		items: [] as T[],
		total: 0,
		page: 1,
		pageSize: '20',
		pageInput: '1',
		query: '',
		queryInput: '',
		userId: '',
		userIdInput: '',
		loading: false,
		error: false,
	}) as PagedListState<T>;
}

async function loadAccessRequests(options: LoadListOptions = {}): Promise<void> {
	await loadPagedList(accessRequestsState, 'admin/api/access-requests/list', filterStatusParam(accessRequestStatusFilter.value), options);
}

async function loadApps(options: LoadListOptions = {}): Promise<void> {
	await loadPagedList(appsState, 'admin/api/apps/list', filterStatusParam(appStatusFilter.value), options);
}

async function loadTokens(options: LoadListOptions = {}): Promise<void> {
	await loadPagedList(tokensState, 'admin/api/tokens/list', filterStatusParam(tokenStatusFilter.value), options);
}

async function loadPagedList<T>(
	state: PagedListState<T>,
	endpoint: AdminListEndpoint,
	status: string | null,
	options: LoadListOptions = {},
): Promise<void> {
	if (options.resetPage) {
		state.page = 1;
		state.pageInput = '1';
	}

	state.loading = true;
	state.error = false;
	try {
		const result = normalizePagedResult(state, await requestPagedList(state, endpoint, status));
		const maxPage = pageCountByTotal(result.total, state.pageSize);
		if (state.page > maxPage) {
			state.page = maxPage;
			state.pageInput = String(state.page);
			const adjustedResult = normalizePagedResult(state, await requestPagedList(state, endpoint, status));
			assignPagedResult(state, adjustedResult);
			return;
		}

		assignPagedResult(state, result);
	} catch (err) {
		state.error = true;
		console.error(err);
	} finally {
		state.loading = false;
	}
}

async function requestPagedList<T>(
	state: PagedListState<T>,
	endpoint: AdminListEndpoint,
	status: string | null,
): Promise<ApiPagedResult<T>> {
	const limit = pageSizeNumber(state);
	const page = Math.max(1, state.page);
	state.page = page;
	state.pageInput = String(page);
	return await misskeyApi<ApiPagedResult<T>, string>(endpoint, {
		status,
		query: state.query || null,
		userId: state.userId || null,
		withTotal: true,
		limit,
		offset: (page - 1) * limit,
	});
}

function normalizePagedResult<T>(state: PagedListState<T>, result: ApiPagedResult<T>): NormalizedPagedResult<T> {
	const items = Array.isArray(result) ? result : (Array.isArray(result.items) ? result.items : []);
	const limit = pageSizeNumber(state);
	const offset = (state.page - 1) * limit;
	const fallbackTotal = offset + items.length + (items.length >= limit ? 1 : 0);
	const total = !Array.isArray(result) && Number.isFinite(result.total) ? Math.max(0, Math.trunc(result.total)) : fallbackTotal;

	return { items, total };
}

function assignPagedResult<T>(state: PagedListState<T>, result: NormalizedPagedResult<T>): void {
	state.items = result.items;
	state.total = result.total;
	state.pageInput = String(state.page);
}

async function applyAccessRequestFilters(): Promise<void> {
	await applyPagedListFilters(accessRequestsState, loadAccessRequests);
}

async function clearAccessRequestFilters(): Promise<void> {
	await clearPagedListFilters(accessRequestsState, loadAccessRequests);
}

async function applyAppFilters(): Promise<void> {
	await applyPagedListFilters(appsState, loadApps);
}

async function clearAppFilters(): Promise<void> {
	await clearPagedListFilters(appsState, loadApps);
}

async function applyTokenFilters(): Promise<void> {
	await applyPagedListFilters(tokensState, loadTokens);
}

async function clearTokenFilters(): Promise<void> {
	await clearPagedListFilters(tokensState, loadTokens);
}

async function applyPagedListFilters<T>(state: PagedListState<T>, loadList: LoadListFn): Promise<void> {
	state.query = state.queryInput.trim();
	state.userId = state.userIdInput.trim();
	await loadList({ resetPage: true });
}

async function clearPagedListFilters<T>(state: PagedListState<T>, loadList: LoadListFn): Promise<void> {
	const changed = hasPagedListFilter(state);
	state.query = '';
	state.queryInput = '';
	state.userId = '';
	state.userIdInput = '';
	if (changed) {
		await loadList({ resetPage: true });
	}
}

async function setPageSize<T>(state: PagedListState<T>, loadList: LoadListFn, value: PageSize | string | number | null | boolean): Promise<void> {
	const nextPageSize = normalizePageSize(String(value));
	if (state.pageSize === nextPageSize) return;
	state.pageSize = nextPageSize;
	await loadList({ resetPage: true });
}

async function goToPage<T>(state: PagedListState<T>, loadList: LoadListFn, page: number): Promise<void> {
	const nextPage = Math.max(1, Math.min(pageCount(state), Math.trunc(page)));
	if (!Number.isFinite(nextPage) || state.page === nextPage) {
		state.pageInput = String(state.page);
		return;
	}
	state.page = nextPage;
	state.pageInput = String(nextPage);
	await loadList();
}

async function jumpToPage<T>(state: PagedListState<T>, loadList: LoadListFn): Promise<void> {
	const nextPage = Number.parseInt(state.pageInput, 10);
	await goToPage(state, loadList, Number.isFinite(nextPage) ? nextPage : state.page);
}

function adminListCaption<T>(status: FilterStatus<string>, state: PagedListState<T>): string {
	const parts = [`状态：${statusLabel(status)}`];
	if (state.query) parts.push(`关键词：${state.query}`);
	if (state.userId) parts.push(`用户：${state.userId}`);
	return parts.join(' · ');
}

function hasPagedListFilter<T>(state: PagedListState<T>): boolean {
	return state.query.length > 0 ||
		state.userId.length > 0 ||
		state.queryInput.trim().length > 0 ||
		state.userIdInput.trim().length > 0;
}

function pageSizeNumber<T>(state: PagedListState<T>): number {
	return Number(state.pageSize);
}

function pageCount<T>(state: PagedListState<T>): number {
	return pageCountByTotal(state.total, state.pageSize);
}

function pageCountByTotal(total: number, pageSize: PageSize): number {
	return Math.max(1, Math.ceil(total / Number(pageSize)));
}

function pageRangeStart<T>(state: PagedListState<T>): number {
	if (state.total === 0) return 0;
	return (state.page - 1) * pageSizeNumber(state) + 1;
}

function pageRangeEnd<T>(state: PagedListState<T>): number {
	return Math.min(state.total, state.page * pageSizeNumber(state));
}

function normalizePageSize(value: string): PageSize {
	return pageSizeValues.includes(value as PageSize) ? value as PageSize : '20';
}

function actionKey(id: string, action: ReviewAction): string {
	return `${id}:${action}`;
}

function isReviewingAccess(id: string, action: Exclude<ReviewAction, 'unsuspend'>): boolean {
	return reviewingAccess.value === actionKey(id, action);
}

function isReviewingApp(id: string, action: ReviewAction): boolean {
	return reviewingApp.value === actionKey(id, action);
}

function filterStatusParam<T extends string>(status: FilterStatus<T>): T | null {
	return status === 'all' ? null : status;
}

function userDisplayName(user: PackedUser | null | undefined): string {
	return user?.name || user?.username || user?.id || '未知用户';
}

function userAcctLabel(user: PackedUser | null | undefined): string {
	if (!user) return '未知用户';
	return `@${user.username}${user.host ? `@${user.host}` : ''}`;
}

function statusLabel(status: string): string {
	return ({
		pending: '待审核',
		approved: '已通过',
		rejected: '已拒绝',
		suspended: '已暂停',
		active: '活跃',
		revoked: '已撤销',
		all: '全部',
	} as Record<string, string>)[status] ?? status;
}

function statusBadgeClass(status: string): string | undefined {
	return ({
		approved: styles.status_approved,
		active: styles.status_active,
		pending: styles.status_pending,
		rejected: styles.status_rejected,
		suspended: styles.status_suspended,
		revoked: styles.status_revoked,
	} as Record<string, string | undefined>)[status];
}

function actionLabel(action: ReviewAction): string {
	return ({
		approve: '通过',
		reject: '拒绝',
		suspend: '暂停',
		unsuspend: '恢复',
	} satisfies Record<ReviewAction, string>)[action];
}

watch(accessRequestStatusFilter, () => {
	void loadAccessRequests({ resetPage: true });
});

watch(appStatusFilter, () => {
	void loadApps({ resetPage: true });
});

watch(tokenStatusFilter, () => {
	void loadTokens({ resetPage: true });
});

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: 'API 管理',
	icon: 'ti ti-api',
}));
</script>

<style lang="scss" module>
.grid,
.summaryGrid,
.switchGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 12px;
}

.metric,
.item {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
}

.metric {
	padding: 14px;

	> span {
		display: block;
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 0.85em;
	}

	> strong {
		display: block;
		margin-top: 4px;
		font-size: 1.4em;
	}
}

.item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px;
}

.itemBody {
	min-width: 0;
}

.itemHeader {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.statusBadge {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 2px 8px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.78em;
	font-weight: 700;
	line-height: 1.2;
}

.status_approved,
.status_active {
	border-color: color-mix(in srgb, var(--MI_THEME-success) 45%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-success) 12%, transparent);
	color: var(--MI_THEME-success);
}

.status_pending {
	border-color: color-mix(in srgb, var(--MI_THEME-warn) 45%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, transparent);
	color: var(--MI_THEME-warn);
}

.status_rejected,
.status_suspended,
.status_revoked {
	border-color: color-mix(in srgb, var(--MI_THEME-error) 45%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent);
	color: var(--MI_THEME-error);
}

.meta {
	margin-top: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	overflow-wrap: anywhere;
}

.listTools {
	display: grid;
	gap: 10px;
}

.filterGrid {
	display: grid;
	grid-template-columns: minmax(150px, 0.8fr) minmax(220px, 1.5fr) minmax(220px, 1fr);
	gap: 10px;
	align-items: end;
}

.loading {
	display: grid;
	min-height: 120px;
	place-items: center;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
}

.listError {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-error) 45%, var(--MI_THEME-divider));
	border-radius: 8px;
	padding: 12px;
	background: color-mix(in srgb, var(--MI_THEME-error) 8%, var(--MI_THEME-panel));
	color: var(--MI_THEME-error);
}

.pager {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	padding: 12px;
	background: var(--MI_THEME-panel);
}

.pagerSummary {
	align-self: center;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.5;
}

.pagerControls {
	display: grid;
	grid-template-columns: minmax(116px, auto) minmax(96px, auto) minmax(0, auto);
	align-items: end;
	gap: 8px;
}

.pageButtons {
	align-items: end;
}

.tokenMetaGrid {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 14px;
	margin-top: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
}

.permissionPanel {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	padding: 14px;
}

.permissionHeader {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 14px;
}

.permissionTitle {
	font-weight: 700;
}

.permissionCaption {
	margin-top: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.5;
}

.permissionGroups {
	display: grid;
	gap: 12px;
}

.permissionGroup {
	border-top: 1px solid var(--MI_THEME-divider);
	padding-top: 12px;
}

.permissionGroupHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
}

.permissionGroupTitle {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.permissionGroupTitle i {
	color: var(--MI_THEME-accent);
}

.permissionOptions {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
	gap: 10px;
}

.permissionOption {
	display: grid;
	grid-template-columns: 28px minmax(0, 1fr);
	gap: 10px;
	min-height: 94px;
	padding: 10px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	text-align: left;
	transition: border-color 0.15s ease, background-color 0.15s ease;
}

.permissionOption:hover,
.permissionOption:focus-visible {
	border-color: var(--MI_THEME-accent);
}

.permissionOptionActive {
	border-color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 9%, var(--MI_THEME-panel));
}

.permissionCheck {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	margin-top: 2px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
}

.permissionOptionActive .permissionCheck {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.permissionBody {
	display: grid;
	gap: 4px;
	min-width: 0;
}

.permissionBody strong,
.permissionBody code,
.permissionBody small {
	overflow-wrap: anywhere;
}

.permissionBody code {
	width: fit-content;
	max-width: 100%;
	border-radius: 4px;
	background: var(--MI_THEME-bg);
	padding: 2px 6px;
	color: var(--MI_THEME-accent);
	font-size: 0.82em;
}

.permissionBody small {
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.45;
}

.empty {
	padding: 14px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}

@container (max-width: 560px) {
	.item {
		align-items: stretch;
		flex-direction: column;
	}

	.filterGrid,
	.pagerControls {
		grid-template-columns: 1fr;
	}

	.permissionHeader,
	.permissionGroupHeader,
	.listError {
		align-items: stretch;
		flex-direction: column;
	}

	.permissionOptions {
		grid-template-columns: 1fr;
	}
}
</style>
