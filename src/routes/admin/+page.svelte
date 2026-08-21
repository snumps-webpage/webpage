<script lang="ts">
	import { enhance } from '$app/forms';
    import type { AttendanceRecord } from '$lib/types';
    import Skeleton from '$lib/components/Skeleton.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';
    import ActionButton from '$lib/components/ActionButton.svelte';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import StatusBadge from '$lib/components/StatusBadge.svelte';
    import SectionHeader from '$lib/components/SectionHeader.svelte';
    import Pagination from '$lib/components/Pagination.svelte';
    import ApplicationDetails from '$lib/components/admin/ApplicationDetails.svelte';
    import { MANUSCRIPT } from '$lib/constants';
    import { createPagination } from '$lib/state.svelte';

	let { data } = $props();
    
    interface Application {
        id: string;
        name: string;
        email: string;
        phone: string;
        department: string;
        background: string;
        submittedAt: string;
        accepted: boolean;
        processing?: boolean;
    }

    interface SeminarRequest {
        id: string;
        title: string;
        speakerNames: string[];
        submittedAt: string;
        status: string;
        processing?: boolean;
    }

    interface Event {
        id: string;
        title: string;
        date: string;
        type: string;
        status: string;
        pathId?: string;
        attendCode?: string;
        processing?: boolean;
    }

    interface AttendanceRecord {
        id: string;
        notionId?: string;
        eventId: string;
        userEmail: string;
        userName: string;
        userDept: string;
        startTime: string;
        endTime?: string;
        status: string;
        processing?: boolean;
    }

    // State for data lists
    let applications = $state<Application[]>([]);
    let seminarRequests = $state<SeminarRequest[]>([]);
    let events = $state<Event[]>([]);
    let attendanceQueue = $state<AttendanceRecord[]>([]);

    let loadingApps = $state(true);
    let loadingSeminars = $state(true);
    let loadingEvents = $state(true);
    let loadingQueue = $state(true);

    let refreshingApps = $state(false);
    let refreshingSeminars = $state(false);

    // Pagination controllers
    const appPagination = createPagination(() => applications, 5);
    const seminarPagination = createPagination(() => seminarRequests, 5);

    // Resolve streamed data
    $effect(() => {
        data.streamed.applications.then(val => {
            applications = (val as Application[]).map((app) => ({ ...app, processing: false }));
            loadingApps = false;
        }).catch(err => {
            console.error("Failed to load applications:", err);
            loadingApps = false;
        });

        data.streamed.seminarRequests.then(val => {
            seminarRequests = val as SeminarRequest[];
            loadingSeminars = false;
        }).catch(err => {
            console.error("Failed to load seminar requests:", err);
            loadingSeminars = false;
        });

        data.streamed.events.then(val => {
            events = val as Event[];
            loadingEvents = false;
        }).catch(err => {
            console.error("Failed to load events:", err);
            loadingEvents = false;
        });

        data.streamed.attendanceQueue.then(val => {
            attendanceQueue = val.map(r => ({ ...r, processing: false }));
            loadingQueue = false;
        }).catch(err => {
            console.error("Failed to load attendance queue:", err);
            loadingQueue = false;
        });
    });

    async function refreshApplications(resetPage = true) {
        refreshingApps = true;
        try {
            const res = await fetch('/api/admin/applications');
            if (res.ok) {
                const newApps = await res.json();
                applications = newApps.map((app: Application) => ({ ...app, processing: false }));
                if (resetPage) appPagination.reset();
            }
        } catch (e) {
            console.error(e);
        } finally {
            refreshingApps = false;
        }
    }

    async function refreshSeminars() {
        refreshingSeminars = true;
        try {
            const res = await fetch('/api/admin/seminar-requests');
            if (res.ok) {
                seminarRequests = await res.json();
                seminarPagination.reset();
            }
        } catch (e) {
            console.error(e);
        } finally {
            refreshingSeminars = false;
        }
    }

    // State for editing attendance
    let editingRecord = $state<AttendanceRecord | null>(null);
    let editDialog: HTMLDialogElement;
    
        function openEdit(record: AttendanceRecord) {
            editingRecord = record;
            editDialog.showModal();
        }
    
        function closeEdit() {
            editDialog.close();
            editingRecord = null;
        }

    // State for viewing an application's details
    let selectedApp = $state<Application | null>(null);
    let appDetailsDialog: HTMLDialogElement;

    function openAppDetails(app: Application) {
        selectedApp = app;
        appDetailsDialog.showModal();
    }

    function closeAppDetails() {
        appDetailsDialog.close();
    }
        
        /**
         * Converts an ISO string to a format compatible with <input type="datetime-local">.
         * datetime-local expects YYYY-MM-DDTHH:MM in local time.
         */
        function toDateTimeLocal(iso?: string) {
            if (!iso) return '';
            return iso.slice(0, 16);
        }
    </script>
    
    <div class="admin-container" class:refreshing={refreshingApps || refreshingSeminars}>
        <ManuscriptHeader title="관리자 대시보드" figure={MANUSCRIPT.FIGURES.ADMIN} />
    	<header>
    		<div class="header-actions">
    			<a href="/admin/events/new" class="admin-action-btn">새 이벤트 만들기</a>
    			<a href="/admin/events/connect" class="admin-action-btn secondary">기존 이벤트 연결</a>
    			<a href="/signup" class="admin-action-btn signup">회원 가입 페이지</a>
    		</div>
    	</header>
    
    		<section class="events-section">
    			<h2 class="no-sel">이벤트 관리</h2>
    			{#if loadingEvents}
    	            <div class="skeleton-list">
    	                <!-- Optimized height to match mobile cards/table rows -->
    	                <Skeleton height="8rem" className="mb-2" />
    	                <Skeleton height="8rem" className="mb-2" />
    	                <Skeleton height="8rem" />
    	            </div>
    	        {:else if events.length === 0}
    				<p class="empty">생성된 이벤트가 없습니다.</p>
    			{:else}
                    <!-- Desktop Table -->
    				<div class="table-container desktop-only">
    					<table>
    						<thead>
    							<tr>
    								<th>제목</th>
    								<th>일시</th>
    								<th>종류</th>
    								<th>상태</th>
    								<th>링크</th>
    								<th>관리</th>
    							</tr>
    						</thead>
    						<tbody>
    							{#each events as event (event.id)}
    								<tr class={event.status}>
    									<td>{event.title}</td>
    									<td>{event.date}</td>
    									<td><StatusBadge status={event.type} type="tag" /></td>
    									<td><StatusBadge status={event.status} /></td>
    									<td>
    										{#if event.status !== 'draft'}
    											<div class="links">
                                                    <span class="hint">Attendance Link</span>
                                                    <CopyButton text={`${window.location.origin}/events/${event.pathId}/${event.attendCode}`} title="출석 링크 복사" />
    											</div>
    										{:else}
    											<span class="hint">Not Published</span>
    										{/if}
    									</td>
    									<td class="actions-cell">
    										{#if event.status === 'draft' || event.status === 'expired'}
                                                <ActionButton 
                                                    action="?/activateEvent" 
                                                    params={{ id: event.id }} 
                                                    label="Activate" 
                                                    className="btn activate small"
                                                    bind:processing={event.processing}
                                                />
    										{:else if event.status === 'active'}
                                                <ActionButton 
                                                    action="?/expireEvent" 
                                                    params={{ id: event.id }} 
                                                    label="Expire" 
                                                    className="btn expire small"
                                                    bind:processing={event.processing}
                                                />
    										{/if}
                                            <ActionButton 
                                                action="?/deleteEvent" 
                                                params={{ id: event.id }} 
                                                label="Delete" 
                                                className="btn delete small"
                                                confirmMessage="정말 삭제하시겠습니까?"
                                                bind:processing={event.processing}
                                            />
    									</td>
    								</tr>
    							{/each}
    						</tbody>
    					</table>
    				</div>

                    <!-- Mobile Cards -->
                    <div class="mobile-card-list mobile-only">
                        {#each events as event (event.id)}
                            <div class="admin-card {event.status}">
                                <div class="card-header">
                                    <span class="title">{event.title}</span>
                                    <StatusBadge status={event.status} />
                                </div>
                                <div class="card-body">
                                    <p><strong>일시:</strong> {event.date}</p>
                                    <p><strong>종류:</strong> <StatusBadge status={event.type} type="tag" /></p>
                                    {#if event.status !== 'draft'}
                                        <div class="links mt-2">
                                            <span class="hint">출석 링크:</span>
                                            <CopyButton text={`${window.location.origin}/events/${event.pathId}/${event.attendCode}`} title="출석 링크 복사" />
                                        </div>
                                    {/if}
                                </div>
                                <div class="card-actions">
                                    {#if event.status === 'draft' || event.status === 'expired'}
                                        <ActionButton 
                                            action="?/activateEvent" 
                                            params={{ id: event.id }} 
                                            label="Activate" 
                                            className="btn activate small"
                                            bind:processing={event.processing}
                                        />
                                    {:else if event.status === 'active'}
                                        <ActionButton 
                                            action="?/expireEvent" 
                                            params={{ id: event.id }} 
                                            label="Expire" 
                                            className="btn expire small"
                                            bind:processing={event.processing}
                                        />
                                    {/if}
                                    <ActionButton 
                                        action="?/deleteEvent" 
                                        params={{ id: event.id }} 
                                        label="Delete" 
                                        className="btn delete small"
                                        confirmMessage="정말 삭제하시겠습니까?"
                                        bind:processing={event.processing}
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>
    			{/if}
    		</section>

    	    		<section class="mt-4">
    	    			<h2 class="no-sel">출석 승인 대기 ({attendanceQueue.length})</h2>
    	    			{#if loadingQueue}
    	    	            <div class="skeleton-list">
    	    	                <Skeleton height="7rem" className="mb-2" />
    	    	                <Skeleton height="7rem" />
    	    	            </div>
    	    	        {:else if attendanceQueue.length === 0}
    	    				<p class="empty">대기 중인 출석 요청이 없습니다.</p>
    	    			{:else}
                            <!-- Desktop Table -->
    	    				<div class="table-container desktop-only">
    	    					<table>
    	    						<thead>
    	    							<tr>
    	    								<th>이름</th>
    	    								<th>학과</th>
    	    								<th>이벤트</th>
    	    								<th>시작 시간</th>
    	    								<th>종료 시간</th>
    	    								<th>관리</th>
    	    							</tr>
    	    						</thead>
    	    						<tbody>
    	    							{#each attendanceQueue as record (record.id)}
    	    								{@const event = events.find(e => e.id === record.eventId)}
    	    								<tr>
    	    									<td>{record.userName}</td>
    	    									<td>{record.userDept}</td>
    	    									<td>{event?.title ?? 'Unknown'}</td>
    	    									<td>{new Date(record.startTime).toLocaleTimeString()}</td>
    	    									<td>{record.endTime ? new Date(record.endTime).toLocaleTimeString() : '-'}</td>
    	    									<td class="actions-cell">
                                                    <ActionButton 
                                                        action="?/approveAttendance" 
                                                        params={{ id: record.id, eventId: record.eventId, userEmail: record.userEmail }} 
                                                        label="승인" 
                                                        className="btn approve small"
                                                        bind:processing={record.processing}
                                                    />
                                                    <ActionButton 
                                                        action="?/rejectAttendance" 
                                                        params={{ id: record.id }} 
                                                        label="거절" 
                                                        className="btn reject small"
                                                        bind:processing={record.processing}
                                                    />
    	    	                                    <button class="btn edit small" onclick={() => openEdit(record)} disabled={record.processing}>수정</button>
                                                    <ActionButton 
                                                        action="?/deleteAttendanceRecord" 
                                                        params={{ id: record.id }} 
                                                        label="삭제" 
                                                        className="btn delete small"
                                                        confirmMessage="정말 삭제하시겠습니까?"
                                                        bind:processing={record.processing}
                                                    />
    	    									</td>
    	    								</tr>
    	    							{/each}
    	    						</tbody>
    	    					</table>
    	    				</div>

                            <!-- Mobile Cards -->
                            <div class="mobile-card-list mobile-only">
                                {#each attendanceQueue as record (record.id)}
                                    {@const event = events.find(e => e.id === record.eventId)}
                                    <div class="admin-card">
                                        <div class="card-header">
                                            <span class="title">{record.userName}</span>
                                            <span class="tag">{record.userDept}</span>
                                        </div>
                                        <div class="card-body">
                                            <p><strong>이벤트:</strong> {event?.title ?? 'Unknown'}</p>
                                            <p><strong>시간:</strong> {new Date(record.startTime).toLocaleTimeString()} ~ {record.endTime ? new Date(record.endTime).toLocaleTimeString() : '-'}</p>
                                        </div>
                                        <div class="card-actions wrap">
                                            <ActionButton 
                                                action="?/approveAttendance" 
                                                params={{ id: record.id, eventId: record.eventId, userEmail: record.userEmail }} 
                                                label="승인" 
                                                className="btn approve small"
                                                bind:processing={record.processing}
                                            />
                                            <ActionButton 
                                                action="?/rejectAttendance" 
                                                params={{ id: record.id }} 
                                                label="거절" 
                                                className="btn reject small"
                                                bind:processing={record.processing}
                                            />
                                            <button class="btn edit small" onclick={() => openEdit(record)} disabled={record.processing}>수정</button>
                                            <ActionButton 
                                                action="?/deleteAttendanceRecord" 
                                                params={{ id: record.id }} 
                                                label="삭제" 
                                                className="btn delete small"
                                                confirmMessage="정말 삭제하시겠습니까?"
                                                bind:processing={record.processing}
                                            />
                                        </div>
                                    </div>
                                {/each}
                            </div>
    	    			{/if}
    	    		</section>

    	    	        <!-- Edit Dialog -->
        <dialog bind:this={editDialog} class="edit-dialog">
            {#if editingRecord}
                <h3>출석 기록 수정</h3>
                <p><strong>{editingRecord.userName}</strong> ({editingRecord.userEmail})</p>
                
                <form method="POST" action="?/updateAttendanceTime" use:enhance={() => {
                    return ({ result }) => {
                        if (result.type === 'success') closeEdit();
                    };
                }}>
                    <input type="hidden" name="id" value={editingRecord.id} />
                    
                    <div class="field">
                        <label for="startTime">시작 시간</label>
                        <input type="datetime-local" id="startTime" name="startTime" value={toDateTimeLocal(editingRecord.startTime)} required />
                    </div>
                    
                    <div class="field">
                        <label for="endTime">종료 시간</label>
                        <input type="datetime-local" id="endTime" name="endTime" value={toDateTimeLocal(editingRecord.endTime)} />
                    </div>
    
                    <div class="dialog-actions">
                        <button type="button" class="btn cancel" onclick={closeEdit}>취소</button>
                        <button class="btn submit">저장</button>
                    </div>
                </form>
            {/if}
        </dialog>

        <!-- Application Details Dialog -->
        <dialog
            bind:this={appDetailsDialog}
            class="edit-dialog"
            onclose={() => (selectedApp = null)}
        >
            {#if selectedApp}
                <h3>신청 상세 정보</h3>
                <p><strong>{selectedApp.name}</strong> ({selectedApp.department})</p>

                <ApplicationDetails
                    email={selectedApp.email}
                    phone={selectedApp.phone}
                    background={selectedApp.background}
                />

                <div class="dialog-actions">
                    <button type="button" class="btn cancel" onclick={closeAppDetails}>닫기</button>
                </div>
            {/if}
        </dialog>
    
    				<section class="mt-4">
    					<SectionHeader 
                            title={`세미나 개설 신청 (${seminarRequests.length})`}
                            refreshing={refreshingSeminars}
                            loading={loadingSeminars}
                            onRefresh={refreshSeminars}
                            ariaLabel="Refresh seminars"
                        />
    
    					{#if loadingSeminars}
    			            <div class="skeleton-list">
    			                <Skeleton height="6rem" className="mb-2" />
    			                <Skeleton height="6rem" className="mb-2" />
    			                <Skeleton height="6rem" />
    			            </div>
    			        {:else if seminarRequests.length === 0}
    						<p class="empty">대기 중인 세미나 신청이 없습니다.</p>
    					{:else}
                            <!-- Desktop Table -->
    						<div class="table-container desktop-only">
    							<table>
    								<thead>
    									<tr>
    										<th>주제</th>
    										<th>발표자</th>
    										<th>신청일</th>
    										<th>관리</th>
    									</tr>
    								</thead>
    								<tbody>
    									{#each seminarPagination.items as req (req.id)}
    										<tr>
    											<td>{req.title}</td>
    											<td>
    												{#if req.speakerNames && req.speakerNames.length > 0}
    													{req.speakerNames.join(', ')}
    												{:else}
    													<span class="hint">미지정</span>
    												{/if}
    											</td>
    											<td>{new Date(req.submittedAt).toLocaleDateString()}</td>
    											<td class="actions-cell">
                                                    <ActionButton 
                                                        action="?/approveSeminar" 
                                                        params={{ id: req.id }} 
                                                        label="승인" 
                                                        className="btn approve small"
                                                        confirmMessage={`'${req.title}' 세미나 개설을 승인하시겠습니까?`}
                                                        successMessage="세미나가 승인되었습니다."
                                                        errorMessage="승인 중 오류가 발생했습니다."
                                                        bind:processing={req.processing}
                                                        onSuccess={refreshSeminars}
                                                    />
                                                    <ActionButton 
                                                        action="?/rejectSeminar" 
                                                        params={{ id: req.id }} 
                                                        label="반려" 
                                                        className="btn reject small"
                                                        confirmMessage="반려하시겠습니까?"
                                                        successMessage="신청이 반려/삭제되었습니다."
                                                        errorMessage="반려 중 오류가 발생했습니다."
                                                        bind:processing={req.processing}
                                                        onSuccess={refreshSeminars}
                                                    />
    											</td>
    										</tr>
    									{/each}
    								</tbody>
    							</table>
    						</div>

                            <!-- Mobile Cards -->
                            <div class="mobile-card-list mobile-only">
                                {#each seminarPagination.items as req (req.id)}
                                    <div class="admin-card">
                                        <div class="card-header">
                                            <span class="title">{req.title}</span>
                                            <StatusBadge status={req.status} />
                                        </div>
                                        <div class="card-body">
                                            <p><strong>발표자:</strong> {req.speakerNames?.join(', ') || '미정'}</p>
                                            <p><strong>신청일:</strong> {new Date(req.submittedAt).toLocaleDateString()}</p>
                                        </div>
                                        <div class="card-actions">
                                            <ActionButton 
                                                action="?/approveSeminar" 
                                                params={{ id: req.id }} 
                                                label="승인" 
                                                className="btn approve small"
                                                confirmMessage={`'${req.title}' 세미나 개설을 승인하시겠습니까?`}
                                                successMessage="세미나가 승인되었습니다."
                                                errorMessage="승인 중 오류가 발생했습니다."
                                                bind:processing={req.processing}
                                                onSuccess={refreshSeminars}
                                            />
                                            <ActionButton 
                                                action="?/rejectSeminar" 
                                                params={{ id: req.id }} 
                                                label="반려" 
                                                className="btn reject small"
                                                confirmMessage="반려하시겠습니까?"
                                                successMessage="신청이 반려/삭제되었습니다."
                                                errorMessage="반려 중 오류가 발생했습니다."
                                                bind:processing={req.processing}
                                                onSuccess={refreshSeminars}
                                            />
                                        </div>
                                    </div>
                                {/each}
                            </div>
    			
    			            <Pagination controller={seminarPagination} />
    					{/if}
    				</section>
    			
    	    		<section class="mt-4">
    					<SectionHeader 
                            title={`가입 승인 대기 (${applications.length})`}
                            refreshing={refreshingApps}
                            loading={loadingApps}
                            onRefresh={() => refreshApplications(true)}
                            ariaLabel="Refresh applications"
                        />
    
    			{#if loadingApps}
    	    		<div class="skeleton-list">
                        <Skeleton height="3rem" className="mb-2" />
                        <Skeleton height="3rem" className="mb-2" />
                        <Skeleton height="3rem" />
                    </div>
    	    	{:else if applications.length === 0}
    	    		<p class="empty">대기 중인 가입 신청이 없습니다.</p>
    	    	{:else}
                    <!-- Desktop Table -->
    	    		<div class="table-container desktop-only">
                        <table>
                            <thead>
                                <tr>
                                    <th>이름</th>
                                    <th>학과</th>
                                    <th>신청일</th>
                                    <th>상세 정보</th>
                                    <th>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each appPagination.items as app (app.id)}
                                    <tr class:accepted={app.accepted}>
                                        <td>{app.name}</td>
                                        <td><span class="tag">{app.department}</span></td>
                                        <td>{new Date(app.submittedAt).toLocaleDateString()}</td>
                                        <td>
                                            <button type="button" class="btn edit small" onclick={() => openAppDetails(app)}>보기</button>
                                        </td>
                                        <td class="actions-cell">
                                            {#if app.accepted}
                                                <StatusBadge status="approved" />
                                            {:else}
                                                <ActionButton 
                                                    action="?/approve" 
                                                    params={{ id: app.id }} 
                                                    label="승인" 
                                                    className="btn approve small"
                                                    successMessage="회원 가입이 승인되었습니다."
                                                    errorMessage="승인 중 오류가 발생했습니다."
                                                    bind:processing={app.processing}
                                                    onSuccess={() => refreshApplications(false)}
                                                />
                                            {/if}

                                            <ActionButton 
                                                action="?/reject" 
                                                params={{ id: app.id }} 
                                                label={app.accepted ? '삭제' : '거절'} 
                                                className="btn reject small"
                                                confirmMessage={app.accepted ? '신청 내역을 삭제하시겠습니까?' : '정말 거절하시겠습니까? 신청 내역이 영구적으로 삭제됩니다.'}
                                                successMessage={app.accepted ? '신청 내역이 삭제되었습니다.' : '가입 신청이 거절되었습니다.'}
                                                errorMessage="처리 중 오류가 발생했습니다."
                                                bind:processing={app.processing}
                                                onSuccess={() => refreshApplications(false)}
                                            />
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    <!-- Mobile Cards -->
                    <div class="mobile-card-list mobile-only">
                        {#each appPagination.items as app (app.id)}
                            <div class="admin-card {app.accepted ? 'accepted' : ''}">
                                <div class="card-header">
                                    <span class="title">{app.name}</span>
                                    <span class="tag">{app.department}</span>
                                </div>
                                <div class="card-body">
                                    <p><strong>신청일:</strong> {new Date(app.submittedAt).toLocaleDateString()}</p>
                                    <button type="button" class="btn edit small" onclick={() => openAppDetails(app)}>상세 정보 보기</button>
                                </div>
                                <div class="card-actions">
                                    {#if app.accepted}
                                        <StatusBadge status="approved" />
                                    {:else}
                                        <ActionButton 
                                            action="?/approve" 
                                            params={{ id: app.id }} 
                                            label="승인" 
                                            className="btn approve small"
                                            successMessage="회원 가입이 승인되었습니다."
                                            errorMessage="승인 중 오류가 발생했습니다."
                                            bind:processing={app.processing}
                                            onSuccess={() => refreshApplications(false)}
                                        />
                                    {/if}
                                    <ActionButton 
                                        action="?/reject" 
                                        params={{ id: app.id }} 
                                        label={app.accepted ? '삭제' : '거절'} 
                                        className="btn reject small"
                                        confirmMessage={app.accepted ? '신청 내역을 삭제하시겠습니까?' : '정말 거절하시겠습니까? 신청 내역이 영구적으로 삭제됩니다.'}
                                        successMessage={app.accepted ? '신청 내역이 삭제되었습니다.' : '가입 신청이 거절되었습니다.'}
                                        errorMessage="처리 중 오류가 발생했습니다."
                                        bind:processing={app.processing}
                                        onSuccess={() => refreshApplications(false)}
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>

                    <Pagination controller={appPagination} />
    			{/if}
    				</section>
    			</div>

<style>
	.mt-4 {
		margin-top: 3rem;
	}

    .mt-2 {
        margin-top: 0.5rem;
    }
	
	.admin-container {
		width: min(100%, 1280px);
		margin: 0 auto;
		padding: 1.6rem 1.5rem 2.2rem;
        color: var(--latex-text);
        transition: opacity 0.3s ease;
	}

    .admin-container.refreshing {
        opacity: 0.45;
        pointer-events: none;
        user-select: none;
    }

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
        flex-wrap: wrap;
		margin-bottom: 2rem;
        border-top: 2px solid var(--latex-rule);
		border-bottom: 1px solid var(--latex-rule);
		padding: 0.95rem 0 0.95rem;
	}

    section + section {
        margin-top: 2.3rem;
        padding-top: 1.1rem;
        border-top: 1px solid var(--latex-rule);
    }

	section > h2 {
		margin: 0 0 1rem;
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 2vw, 1.34rem);
		font-weight: 540;
		color: var(--latex-text);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.45rem;
        flex-wrap: wrap;
	}

	.admin-action-btn {
		display: inline-flex;
        align-items: center;
        justify-content: center;
		padding: 0.48rem 0.88rem;
		border: 1px solid var(--latex-rule);
		background: transparent;
		color: var(--latex-text);
		text-decoration: none;
		font-weight: 630;
		font-size: 0.69rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
		font-family: var(--font-mono);
		transition: background-color 0.16s ease, color 0.16s ease;
	}

	.admin-action-btn:hover {
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .admin-action-btn.signup {
        border-color: var(--latex-accent);
        color: var(--latex-accent);
    }

    .admin-action-btn.signup:hover {
        background: var(--latex-accent);
        color: var(--latex-bg);
    }

    .approve,
    .activate,
    .submit {
        border-color: var(--latex-text);
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .expire {
        color: var(--latex-muted);
        border-color: var(--latex-muted);
    }

    .reject,
    .delete {
        color: var(--latex-accent);
        border-color: var(--latex-accent);
    }

    .edit {
        border-color: var(--latex-text);
    }

    .cancel {
        border-color: var(--latex-rule);
    }

    .reject:hover:not(:disabled),
    .delete:hover:not(:disabled) {
        background: var(--latex-accent);
        color: var(--latex-bg);
        border-color: var(--latex-accent);
    }

    .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

	.hint {
        margin: 0;
        color: var(--latex-muted);
        font-size: 0.79rem;
        font-family: var(--font-body);
    }

    .links {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.28rem;
    }

    .skeleton-list {
        display: grid;
        gap: 0.62rem;
    }

	.table-container {
        width: 100%;
		border: 1px solid var(--latex-rule);
		background: var(--latex-bg);
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
        min-width: 760px;
	}

	th {
		padding: 0.72rem 0.78rem;
		font-weight: 700;
		color: var(--latex-muted);
		text-transform: uppercase;
		font-size: 0.64rem;
		letter-spacing: 0.1em;
		border-bottom: 1px solid var(--latex-rule);
        font-family: var(--font-mono);
        white-space: nowrap;
	}

	td {
		padding: 0.73rem 0.78rem;
		border-bottom: 1px solid var(--latex-rule);
		color: var(--latex-text);
        font-family: var(--font-body);
        font-size: 0.94rem;
        vertical-align: top;
	}

    tr.accepted td {
        color: var(--latex-muted);
    }

	tr:last-child td {
        border-bottom: 0;
    }

	.actions-cell {
		display: flex;
		gap: 0.35rem;
		align-items: center;
        flex-wrap: wrap;
	}

    .tag {
        display: inline-flex;
        align-items: center;
		padding: 0.2rem 0.48rem;
		font-size: 0.63rem;
        line-height: 1.2;
		font-weight: 700;
        letter-spacing: 0.07em;
		white-space: nowrap;
		text-transform: uppercase;
        font-family: var(--font-mono);
        border: 1px solid var(--latex-rule);
        background: transparent;
        color: var(--latex-muted);
	}

    .edit-dialog {
        width: min(96vw, 520px);
        margin: auto;
        padding: 1rem 1rem 1.1rem;
        border: 1px solid var(--latex-rule);
        border-top-width: 2px;
        background: var(--latex-bg);
        color: var(--latex-text);
    }

    .edit-dialog::backdrop {
        background: rgba(0, 0, 0, 0.28);
    }
    
    .edit-dialog h3 {
		margin: 0 0 0.45rem;
		font-family: var(--font-display);
        font-size: 1.16rem;
		font-weight: 540;
	}

    .edit-dialog p {
        margin: 0 0 0.8rem;
        color: var(--latex-muted);
    }

    .edit-dialog .field {
        margin-bottom: 0.75rem;
    }
    
    .edit-dialog label {
        display: block;
        margin-bottom: 0.3rem;
        color: var(--latex-muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
        font-family: var(--font-mono);
        font-size: 0.64rem;
        font-weight: 700;
    }
    
    .edit-dialog input {
        width: 100%;
        border: 1px solid var(--latex-rule);
        border-radius: 0;
        background: var(--latex-bg);
        color: var(--latex-text);
        font-family: var(--font-body);
        padding: 0.55rem 0.6rem;
    }

    .edit-dialog input:focus-visible,
    .admin-action-btn:focus-visible {
        outline: 2px solid var(--latex-accent);
        outline-offset: 2px;
    }

    .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.35rem;
        margin-top: 0.9rem;
    }

    .mobile-card-list {
        display: flex;
        flex-direction: column;
        gap: 0.72rem;
    }

    .admin-card {
        border: 1px solid var(--latex-rule);
        background: var(--latex-bg);
        padding: 0.8rem;
    }

    .admin-card .card-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 0.5rem;
        border-bottom: 1px solid var(--latex-rule);
        padding-bottom: 0.52rem;
        margin-bottom: 0.52rem;
    }

    .admin-card .title {
        color: var(--latex-text);
        font-family: var(--font-display);
        font-size: 1.02rem;
        line-height: 1.35;
    }

    .admin-card .card-body p {
        margin: 0.28rem 0;
        font-size: 0.9rem;
        line-height: 1.45;
    }

    .admin-card .card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.7rem;
    }

    .card-actions.wrap {
        row-gap: 0.45rem;
    }

    .desktop-only {
        display: block;
    }

    .mobile-only {
        display: none;
    }

    @media (max-width: 980px) {
        .header-actions {
            width: 100%;
        }
    }

    @media (max-width: 768px) {
        .admin-container {
            padding: 1.1rem 0.95rem 1.5rem;
        }

        .desktop-only {
            display: none;
        }

        .mobile-only {
            display: block;
        }

        header {
            align-items: flex-start;
            padding-top: 0.75rem;
            padding-bottom: 0.75rem;
        }

        .header-actions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.4rem;
        }

        .admin-action-btn {
            width: 100%;
            justify-content: center;
        }

        .mt-4 {
            margin-top: 2rem;
        }
    }

    @media (max-width: 620px) {
        .section-header {
            align-items: flex-start;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .btn,
        .admin-action-btn {
            transition: none;
        }
    }
</style>
