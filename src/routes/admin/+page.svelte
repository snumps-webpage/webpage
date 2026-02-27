<script lang="ts">
	import { enhance } from '$app/forms';
    import { toasts } from '$lib/toasts';
	import type { AttendanceRecord } from '$lib/types';
    import Skeleton from '$lib/components/Skeleton.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';

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
    }

    interface Event {
        id: string;
        title: string;
        date: string;
        type: string;
        status: string;
        pathId?: string;
        attendCode?: string;
    }

    // State for applications to allow partial updates
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

    // Resolve streamed data
    $effect(() => {
        data.applications.then(val => {
            applications = (val as Application[]).map((app) => ({ ...app, processing: false }));
            loadingApps = false;
        });
        data.seminarRequests.then(val => {
            seminarRequests = val as SeminarRequest[];
            loadingSeminars = false;
        });
        data.events.then(val => {
            events = val as Event[];
            loadingEvents = false;
        });
        data.attendanceQueue.then(val => {
            attendanceQueue = val;
            loadingQueue = false;
        });
    });

    // Clamp indices if data length changes
    $effect(() => {
        if (applications.length > 0 && appPage > totalAppPages && totalAppPages > 0) {
            appPage = totalAppPages;
        }
        if (seminarRequests.length > 0 && seminarPage > totalSeminarPages && totalSeminarPages > 0) {
            seminarPage = totalSeminarPages;
        }
    });

    async function refreshApplications() {
        refreshingApps = true;
        try {
            const res = await fetch('/api/admin/applications');
            if (res.ok) {
                const newApps = await res.json();
                applications = newApps.map((app: Application) => ({ ...app, processing: false }));
                appPage = 1; // Reset to first page on refresh
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
                seminarPage = 1; // Reset pagination to first page
            }
        } catch (e) {
            console.error(e);
        } finally {
            refreshingSeminars = false;
        }
    }

    // Pagination for applications
    let appPage = $state(1);
    const appLimit = 5;
    let totalAppPages = $derived(Math.ceil(applications.length / appLimit));
    let paginatedApps = $derived(
        applications.slice((appPage - 1) * appLimit, appPage * appLimit)
    );

    // Pagination for seminar requests
    let seminarPage = $state(1);
    const seminarLimit = 5;
    let totalSeminarPages = $derived(Math.ceil(seminarRequests.length / seminarLimit));
    let paginatedSeminars = $derived(
        seminarRequests.slice((seminarPage - 1) * seminarLimit, seminarPage * seminarLimit)
    );

    // State for editing attendance
    let editingRecord = $state<AttendanceRecord | null>(null);
    let editDialog: HTMLDialogElement;
    
    // State for application details
    let selectedApp = $state<Application | null>(null);
    let appDetailsDialog: HTMLDialogElement;

    function openEdit(record: AttendanceRecord) {
        editingRecord = record;
        editDialog.showModal();
    }

    function closeEdit() {
        editDialog.close();
        editingRecord = null;
    }

    function openAppDetails(app: Application) {
        selectedApp = app;
        appDetailsDialog.showModal();
    }

    function closeAppDetails() {
        appDetailsDialog.close();
        selectedApp = null;
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
    
    <div class="admin-container">
    	<header>
    		<h1 class="no-sel">관리자 대시보드</h1>
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
    	                <Skeleton height="3rem" className="mb-2" />
    	                <Skeleton height="3rem" className="mb-2" />
    	                <Skeleton height="3rem" />
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
    									<td><span class="tag">{event.type}</span></td>
    									<td><span class="status-badge {event.status}">{event.status.toUpperCase()}</span></td>
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
    											<form method="POST" action="?/activateEvent" use:enhance>
    												<input type="hidden" name="id" value={event.id} />
    												<button class="btn activate small">Activate</button>
    											</form>
    										{:else if event.status === 'active'}
    											<form method="POST" action="?/expireEvent" use:enhance>
    												<input type="hidden" name="id" value={event.id} />
    												<button class="btn expire small">Expire</button>
    											</form>
    										{/if}
    										<form method="POST" action="?/deleteEvent" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
    											<input type="hidden" name="id" value={event.id} />
    											<button class="btn delete small">Delete</button>
    										</form>
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
                                    <span class="status-badge {event.status}">{event.status}</span>
                                </div>
                                <div class="card-body">
                                    <p><strong>일시:</strong> {event.date}</p>
                                    <p><strong>종류:</strong> <span class="tag">{event.type}</span></p>
                                    {#if event.status !== 'draft'}
                                        <div class="links mt-2">
                                            <span class="hint">출석 링크:</span>
                                            <CopyButton text={`${window.location.origin}/events/${event.pathId}/${event.attendCode}`} title="출석 링크 복사" />
                                        </div>
                                    {/if}
                                </div>
                                <div class="card-actions">
                                    {#if event.status === 'draft' || event.status === 'expired'}
                                        <form method="POST" action="?/activateEvent" use:enhance>
                                            <input type="hidden" name="id" value={event.id} />
                                            <button class="btn activate small">Activate</button>
                                        </form>
                                    {:else if event.status === 'active'}
                                        <form method="POST" action="?/expireEvent" use:enhance>
                                            <input type="hidden" name="id" value={event.id} />
                                            <button class="btn expire small">Expire</button>
                                        </form>
                                    {/if}
                                    <form method="POST" action="?/deleteEvent" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
                                        <input type="hidden" name="id" value={event.id} />
                                        <button class="btn delete small">Delete</button>
                                    </form>
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
    	    	                <Skeleton height="3rem" className="mb-2" />
    	    	                <Skeleton height="3rem" />
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
    	    										<form method="POST" action="?/approveAttendance" use:enhance>
    	    											<input type="hidden" name="id" value={record.id} />
    	    											<input type="hidden" name="eventId" value={record.eventId} />
    	    											<input type="hidden" name="userEmail" value={record.userEmail} />
    	    											<button class="btn approve small">승인</button>
    	    										</form>
    	    										<form method="POST" action="?/rejectAttendance" use:enhance>
    	    											<input type="hidden" name="id" value={record.id} />
    	    											<button class="btn reject small">거절</button>
    	    										</form>
    	    	                                    <button class="btn edit small" onclick={() => openEdit(record)}>수정</button>
    	    	                                    <form method="POST" action="?/deleteAttendanceRecord" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
    	    	                                        <input type="hidden" name="id" value={record.id} />
    	    	                                        <button class="btn delete small">삭제</button>
    	    	                                    </form>
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
                                            <form method="POST" action="?/approveAttendance" use:enhance>
                                                <input type="hidden" name="id" value={record.id} />
                                                <input type="hidden" name="eventId" value={record.eventId} />
                                                <input type="hidden" name="userEmail" value={record.userEmail} />
                                                <button class="btn approve small">승인</button>
                                            </form>
                                            <form method="POST" action="?/rejectAttendance" use:enhance>
                                                <input type="hidden" name="id" value={record.id} />
                                                <button class="btn reject small">거절</button>
                                            </form>
                                            <button class="btn edit small" onclick={() => openEdit(record)}>수정</button>
                                            <form method="POST" action="?/deleteAttendanceRecord" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
                                                <input type="hidden" name="id" value={record.id} />
                                                <button class="btn delete small">삭제</button>
                                            </form>
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
        <dialog bind:this={appDetailsDialog} class="edit-dialog app-details-dialog">
            {#if selectedApp}
                <h3>신청 상세 정보</h3>
                <p class="app-meta"><strong>{selectedApp.name}</strong> ({selectedApp.department})</p>
                
                <div class="details-body">
                    <div class="detail-item">
                        <span class="detail-label">이메일</span>
                        <div class="row">
                            <span>{selectedApp.email}</span>
                            <CopyButton text={selectedApp.email} title="이메일 복사" />
                        </div>
                    </div>
                    
                    <div class="detail-item">
                        <span class="detail-label">전화번호</span>
                        <div class="row">
                            <span>{selectedApp.phone}</span>
                            <CopyButton text={selectedApp.phone} title="전화번호 복사" />
                        </div>
                    </div>

                    <div class="detail-item">
                        <span class="detail-label">신청일</span>
                        <p>{new Date(selectedApp.submittedAt).toLocaleString()}</p>
                    </div>

                    <div class="detail-item">
                        <span class="detail-label">배경지식</span>
                        <div class="background-box">
                            {selectedApp.background || '없음'}
                        </div>
                    </div>
                </div>

                <div class="dialog-actions">
                    <button type="button" class="btn cancel" onclick={closeAppDetails}>닫기</button>
                </div>
            {/if}
        </dialog>
    
    				<section class="mt-4">
    
    					<div class="section-header">
    			            <h2 class="no-sel">세미나 개설 신청 ({seminarRequests.length})</h2>
    			            <button 
    			                class="refresh-btn" 
    			                onclick={refreshSeminars} 
    			                disabled={refreshingSeminars || loadingSeminars}
    			                aria-label="Refresh seminars"
    			            >
    			                <span class="refresh-icon" class:spinning={refreshingSeminars}>🔄</span>
    			            </button>
    			        </div>
    
    					{#if loadingSeminars}
    			            <div class="skeleton-list">
    			                <Skeleton height="3rem" className="mb-2" />
    			                <Skeleton height="3rem" className="mb-2" />
    			                <Skeleton height="3rem" />
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
    									{#each paginatedSeminars as req (req.id)}
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
    												<form method="POST" action="?/approveSeminar" use:enhance={() => {
    													return ({ result, update }) => {
    														if (result.type === 'success') toasts.success('세미나가 승인되었습니다.');
    														update();
    													};
    												}} onsubmit={() => confirm(`'${req.title}' 세미나 개설을 승인하시겠습니까?`)}>
    													<input type="hidden" name="id" value={req.id} />
    													<button class="btn approve small">승인</button>
    												</form>
    												<form method="POST" action="?/rejectSeminar" use:enhance={() => {
    													return ({ result, update }) => {
    														if (result.type === 'success') toasts.info('신청이 반려/삭제되었습니다.');
    														update();
    													};
    												}} onsubmit={() => confirm('반려하시겠습니까?')}>
    													<input type="hidden" name="id" value={req.id} />
    													<button class="btn reject small">반려</button>
    												</form>
    											</td>
    										</tr>
    									{/each}
    								</tbody>
    							</table>
    						</div>

                            <!-- Mobile Cards -->
                            <div class="mobile-card-list mobile-only">
                                {#each paginatedSeminars as req (req.id)}
                                    <div class="admin-card">
                                        <div class="card-header">
                                            <span class="title">{req.title}</span>
                                            <span class="tag status {req.status}">{req.status}</span>
                                        </div>
                                        <div class="card-body">
                                            <p><strong>발표자:</strong> {req.speakerNames?.join(', ') || '미지정'}</p>
                                            <p><strong>신청일:</strong> {new Date(req.submittedAt).toLocaleDateString()}</p>
                                        </div>
                                        <div class="card-actions">
                                            <form method="POST" action="?/approveSeminar" use:enhance>
                                                <input type="hidden" name="id" value={req.id} />
                                                <button class="btn approve small">승인</button>
                                            </form>
                                            <form method="POST" action="?/rejectSeminar" use:enhance>
                                                <input type="hidden" name="id" value={req.id} />
                                                <button class="btn reject small">반려</button>
                                            </form>
                                        </div>
                                    </div>
                                {/each}
                            </div>
    			
    			            {#if totalSeminarPages > 1}
    			                <div class="pagination">
    			                    <button class="page-btn" disabled={seminarPage === 1} onclick={() => seminarPage--}>이전</button>
    			                    {#each Array.from({ length: totalSeminarPages }).map((_, i) => i) as i (i)}
    			                        <button class:active={seminarPage === i + 1} onclick={() => seminarPage = i + 1} class="page-btn">{i + 1}</button>
    			                    {/each}
    			                    <button class="page-btn" disabled={seminarPage === totalSeminarPages} onclick={() => seminarPage++}>다음</button>
    			                </div>
    			            {/if}
    					{/if}
    				</section>
    			
    	    		<section class="mt-4">
    			
    	    		    <div class="section-header">
    	    		        <h2 class="no-sel">가입 승인 대기 ({applications.length})</h2>
    	    		        <button class="refresh-btn" onclick={refreshApplications} disabled={refreshingApps || loadingApps} aria-label="Refresh applications">
    	    		            <span class="refresh-icon" class:spinning={refreshingApps}>🔄</span>
    	    		        </button>
    	    		    </div>
    
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
                                    <th class="col-name">이름</th>
                                    <th class="col-dept">학과</th>
                                    <th class="col-date">신청일</th>
                                    <th>상세 정보</th>
                                    <th>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each paginatedApps as app (app.id)}
                                    <tr class:accepted={app.accepted}>
                                        <td class="col-name">{app.name}</td>
                                        <td class="col-dept"><span class="tag">{app.department}</span></td>
                                        <td class="col-date">{new Date(app.submittedAt).toLocaleDateString()}</td>
                                        <td>
                                            <button class="btn info small" onclick={() => openAppDetails(app)}>보기</button>
                                        </td>
                                        <td class="actions-cell">
                                            {#if app.accepted}
                                                <span class="status-badge active">승인됨</span>
                                            {:else}
                                                <form method="POST" action="?/approve" use:enhance={({ formData }) => {
                                                    const id = formData.get('id');
                                                    const idx = applications.findIndex(a => a.id === id);
                                                    if (idx !== -1) applications[idx].processing = true;
                                                    return async ({ result }) => {
                                                        if (result.type === 'success') {
                                                            toasts.success('회원 가입이 승인되었습니다.');
                                                            if (idx !== -1) {
                                                                applications[idx].accepted = true;
                                                                applications[idx].processing = false;
                                                            }
                                                        } else {
                                                            if (idx !== -1) applications[idx].processing = false;
                                                        }
                                                    };
                                                }}>
                                                    <input type="hidden" name="id" value={app.id} />
                                                    <button class="btn approve small" disabled={app.processing}>승인</button>
                                                </form>
                                            {/if}

                                            <form method="POST" action="?/reject" use:enhance={({ formData }) => {
                                                const id = formData.get('id');
                                                const idx = applications.findIndex(a => a.id === id);
                                                if (idx !== -1) applications[idx].processing = true;
                                                return async ({ result, update }) => {
                                                    if (result.type === 'failure' || result.type === 'error') {
                                                        if (idx !== -1) applications[idx].processing = false;
                                                    }
                                                    update();
                                                };
                                            }} onsubmit={() => confirm(app.accepted ? '신청 내역을 삭제하시겠습니까?' : '정말 거절하시겠습니까? 신청 내역이 영구적으로 삭제됩니다.')}>
                                                <input type="hidden" name="id" value={app.id} />
                                                <button class="btn reject small" disabled={app.processing}>{app.accepted ? '삭제' : '거절'}</button>
                                            </form>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    <!-- Mobile Cards -->
                    <div class="mobile-card-list mobile-only">
                        {#each paginatedApps as app (app.id)}
                            <div class="admin-card {app.accepted ? 'accepted' : ''}">
                                <div class="card-header">
                                    <span class="title">{app.name}</span>
                                    <span class="tag">{app.department}</span>
                                </div>
                                <div class="card-body">
                                    <p><strong>신청일:</strong> {new Date(app.submittedAt).toLocaleDateString()}</p>
                                    <button class="btn info small" onclick={() => openAppDetails(app)}>상세 정보 보기</button>
                                </div>
                                <div class="card-actions">
                                    {#if app.accepted}
                                        <span class="status-badge active">승인됨</span>
                                    {:else}
                                        <form method="POST" action="?/approve" use:enhance>
                                            <input type="hidden" name="id" value={app.id} />
                                            <button class="btn approve small">승인</button>
                                        </form>
                                    {/if}
                                    <form method="POST" action="?/reject" use:enhance>
                                        <input type="hidden" name="id" value={app.id} />
                                        <button class="btn reject small">{app.accepted ? '삭제' : '거절'}</button>
                                    </form>
                                </div>
                            </div>
                        {/each}
                    </div>

                    {#if totalAppPages > 1}
                        <div class="pagination">
                            <button class="page-btn" disabled={appPage === 1} onclick={() => appPage--}>이전</button>
                            {#each Array.from({ length: totalAppPages }).map((_, i) => i) as i (i)}
                                <button class:active={appPage === i + 1} onclick={() => appPage = i + 1} class="page-btn">{i + 1}</button>
                            {/each}
                            <button class="page-btn" disabled={appPage === totalAppPages} onclick={() => appPage++}>다음</button>
                        </div>
                    {/if}
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

	h1 {
		margin: 0;
		color: var(--latex-text);
		font-family: var(--font-display);
		font-weight: 550;
        letter-spacing: 0.01em;
		font-size: clamp(1.45rem, 2.8vw, 2.05rem);
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

    .section-header h2 {
        margin: 0;
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

    .section-header {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin-bottom: 1rem;
    }

    .refresh-btn,
    .page-btn,
    .btn {
        border: 1px solid var(--latex-rule);
        border-radius: 0;
        background: transparent;
        color: var(--latex-text);
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        font-weight: 620;
        cursor: pointer;
        transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
    }

    .refresh-btn {
        width: 1.9rem;
        height: 1.9rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.92rem;
        padding: 0;
    }

    .refresh-icon {
        display: inline-block;
        line-height: 1;
    }

    .refresh-icon.spinning {
        animation: spin 1.05s linear infinite;
    }

    .btn {
		padding: 0.35rem 0.65rem;
        font-size: 0.68rem;
	}

    .btn.small {
        min-width: 3.1rem;
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

    .edit,
    .info {
        border-color: var(--latex-text);
    }

    .cancel {
        border-color: var(--latex-rule);
    }

    .refresh-btn:hover:not(:disabled),
    .page-btn:hover:not(:disabled),
    .btn:hover:not(:disabled) {
        background: var(--latex-text);
        color: var(--latex-bg);
        border-color: var(--latex-text);
    }

    .reject:hover:not(:disabled),
    .delete:hover:not(:disabled) {
        background: var(--latex-accent);
        color: var(--latex-bg);
        border-color: var(--latex-accent);
    }

    .btn:disabled,
    .refresh-btn:disabled,
    .page-btn:disabled {
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

	.empty {
		color: var(--latex-muted);
		text-align: center;
		padding: 1.8rem 1rem;
		background: var(--latex-bg);
		border: 1px dashed var(--latex-rule);
		font-family: var(--font-body);
        line-height: 1.55;
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

    .col-name,
    .col-dept,
    .col-date {
        white-space: nowrap;
        width: 1%;
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

    .status-badge,
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

    .status-badge.active,
    .status-badge.approved,
    .tag.status.approved {
        border-color: var(--latex-text);
        color: var(--latex-text);
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .status-badge.expired,
    .status-badge.rejected,
    .tag.status.rejected {
        border-color: var(--latex-accent);
        color: var(--latex-accent);
    }

    .status-badge.pending,
    .tag.status.pending,
    .status-badge.draft {
        color: var(--latex-muted);
        border-color: var(--latex-rule);
    }

    .app-meta {
        font-family: var(--font-body);
        font-size: 0.94rem;
        color: var(--latex-text);
        margin-bottom: 1.25rem;
    }

    .detail-item {
        margin-bottom: 0.85rem;
    }

    .detail-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--latex-muted);
        margin-bottom: 0.35rem;
    }

    .detail-item .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .background-box {
        border: 1px solid var(--latex-rule);
        padding: 0.72rem 0.8rem;
        font-family: var(--font-body);
        background: var(--latex-bg);
        line-height: 1.5;
        white-space: pre-wrap;
        min-height: 4rem;
        max-height: 12rem;
        overflow-y: auto;
    }

    .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 1.05rem;
    }

    .page-btn {
        padding: 0.4rem 0.64rem;
        font-size: 0.66rem;
    }

    .page-btn.active {
        background: var(--latex-text);
        color: var(--latex-bg);
        border-color: var(--latex-text);
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
    .admin-action-btn:focus-visible,
    .btn:focus-visible,
    .page-btn:focus-visible,
    .refresh-btn:focus-visible {
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
        h1 {
            font-size: 1.36rem;
        }

        .section-header {
            align-items: flex-start;
        }

        .empty {
            padding: 1.2rem 0.8rem;
            font-size: 0.9rem;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .refresh-btn,
        .page-btn,
        .btn,
        .admin-action-btn {
            transition: none;
        }

        .refresh-icon.spinning {
            animation: none;
        }
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>
