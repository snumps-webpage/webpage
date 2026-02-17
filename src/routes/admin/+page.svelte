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
    
        function openEdit(record: AttendanceRecord) {
            editingRecord = record;
            editDialog.showModal();
        }
    
        function closeEdit() {
            editDialog.close();
            editingRecord = null;
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
                                                                        <span class="status-badge {req.status}">{req.status}</span>
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
                                    <th>이름</th>
                                    <th>학과</th>
                                    <th>신청일</th>
                                    <th>상세 정보</th>
                                    <th>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each paginatedApps as app (app.id)}
                                    <tr class:accepted={app.accepted}>
                                        <td>{app.name}</td>
                                        <td><span class="tag">{app.department}</span></td>
                                        <td>{new Date(app.submittedAt).toLocaleDateString()}</td>
                                        <td>
                                            <details>
                                                <summary>보기</summary>
                                                <div class="details-content">
                                                    <p class="email-row">
                                                        <strong>이메일:</strong> {app.email}
                                                        <CopyButton text={app.email} title="이메일 복사" />
                                                    </p>
                                                    <p class="phone-row">
                                                        <strong>전화번호:</strong> {app.phone}
                                                        <CopyButton text={app.phone} title="전화번호 복사" />
                                                    </p>
                                                    <p><strong>배경지식:</strong><br>{app.background || '-'}</p>
                                                </div>
                                            </details>
                                        </td>
                                        <td class="actions-cell">
                                            {#if app.accepted}
                                                <span class="status-badge approved">승인됨</span>
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
                                    <details>
                                        <summary>상세 정보 보기</summary>
                                        <div class="details-content mt-2">
                                            <p class="email-row"><strong>이메일:</strong> {app.email} <CopyButton text={app.email} /></p>
                                            <p class="phone-row"><strong>전화번호:</strong> {app.phone} <CopyButton text={app.phone} /></p>
                                            <p><strong>배경지식:</strong><br>{app.background || '-'}</p>
                                        </div>
                                    </details>
                                </div>
                                <div class="card-actions">
                                    {#if app.accepted}
                                        <span class="status-badge approved">승인됨</span>
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
		margin-top: 4rem;
	}

    .mt-2 {
        margin-top: 0.5rem;
    }
	
	.admin-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
        animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        width: 100%;
        box-sizing: border-box;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 3rem;
		border-bottom: 2px solid var(--border-color);
		padding-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1.5rem;
	}

	h1 { 
		margin: 0; 
		color: var(--text-primary);
		font-family: var(--font-display);
		font-weight: 600;
        font-size: 2.25rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
        flex-wrap: wrap;
	}

	.admin-action-btn {
		background: var(--text-primary);
		color: var(--bg-primary);
		padding: 0.75rem 1.5rem;
		border-radius: 99px;
		text-decoration: none;
		font-weight: 700;
		font-size: 0.85rem;
		user-select: none;
		font-family: var(--font-mono);
		transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border: 1px solid var(--text-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
	}

	.admin-action-btn:hover { background: transparent; color: var(--text-primary); }
	.admin-action-btn.secondary { background: transparent; color: var(--text-primary); border-color: var(--border-color); }
    .admin-action-btn.secondary:hover { border-color: var(--text-primary); }
	.admin-action-btn.signup { background: var(--color-success-text); border-color: var(--color-success-text); color: white; }

	.status-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.8rem;
		height: 2rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 700;
		white-space: nowrap;
		user-select: none;
		text-transform: uppercase;
		letter-spacing: 0.05em;
        font-family: var(--font-mono);
        line-height: 1;
	}
	.status-badge.draft { background: var(--bg-secondary); color: var(--text-secondary); }
	.status-badge.active, .status-badge.approved { background: var(--color-success-bg); color: var(--color-success-text); }
	.status-badge.expired, .status-badge.rejected { background: var(--color-danger-bg); color: var(--color-danger-text); }
    .status-badge.pending { background: var(--color-warning-bg); color: var(--color-warning-text); }

	.hint { color: var(--text-secondary); font-size: 0.85rem; font-style: italic; font-family: var(--font-body); }

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.8rem;
		height: 2rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s;
		user-select: none;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        line-height: 1;
	}

	.btn:hover { opacity: 0.9; transform: translateY(-1px); }
	.activate { background: var(--color-success-text); color: white; }
	.expire { background: var(--color-warning-text); color: white; }
	.delete { background: var(--text-secondary); color: white; }
    .edit { background: var(--text-primary); color: var(--bg-primary); }
    .approve { background: var(--color-success-text); color: white; }
	.reject { background: var(--color-danger-text); color: white; }

	.empty {
		color: var(--text-secondary);
		text-align: center;
		padding: 4rem;
		background: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		user-select: none;
		font-family: var(--font-display);
		font-style: italic;
        font-size: 1.1rem;
	}

    .edit-dialog {
        padding: 2.5rem;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        box-shadow: var(--shadow);
        min-width: 400px;
        max-width: 95vw;
        background: var(--bg-secondary);
        color: var(--text-primary);
    }
    
    .edit-dialog h3 { 
		margin-top: 0; 
		color: var(--text-primary); 
		font-family: var(--font-display);
        font-style: italic;
	}
    
    .edit-dialog label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.1em;
        font-family: var(--font-mono);
    }
    
    .edit-dialog input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-family: var(--font-mono);
    }

	.table-container {
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		overflow: hidden;
        box-shadow: var(--shadow);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th {
		background: var(--bg-secondary);
		padding: 1rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		border-bottom: 1px solid var(--border-color);
        font-family: var(--font-mono);
	}

	td {
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-primary);
        font-family: var(--font-body);
        font-size: 1rem;
	}

	tr:last-child td { border-bottom: none; }

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
        flex-wrap: wrap;
	}

    .section-header {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        margin-bottom: 1.5rem;
    }

    .section-header h2 {
        margin: 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		color: var(--text-primary);
        font-style: italic;
    }

    .refresh-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.5rem;
        border-radius: 99px;
        transition: all 0.2s;
        color: var(--text-secondary);
    }

    .refresh-btn:hover:not(:disabled) {
        border-color: var(--text-primary);
        color: var(--text-primary);
    }

    .refresh-icon.spinning { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .pagination {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 2rem;
    }

    .page-btn {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        transition: all 0.2s;
        user-select: none;
        font-weight: 600;
        font-family: var(--font-mono);
    }

    .page-btn:hover:not(:disabled) { background: var(--text-primary); color: var(--bg-primary); }
    .page-btn.active { background: var(--text-primary); color: var(--bg-primary); border-color: var(--text-primary); }

    /* Detail View */
    summary {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-secondary);
        cursor: pointer;
    }
    .details-content {
        background: var(--bg-secondary);
        padding: 1.25rem;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        margin-top: 0.5rem;
        font-family: var(--font-body);
    }

    .phone-row, .email-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .tag {
        background: var(--bg-secondary);
        color: var(--text-secondary);
        padding: 0.25rem 0.5rem;
        border-radius: 3px;
        font-family: var(--font-mono);
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
    }

    /* Mobile Cards */
    .mobile-card-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .admin-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 1.25rem;
        box-shadow: var(--shadow);
        animation: slide-up-fade 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .admin-card .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.75rem;
        margin-bottom: 0.75rem;
    }

    .admin-card .title {
        font-family: var(--font-display);
        font-weight: 600;
        font-style: italic;
        font-size: 1.2rem;
        color: var(--text-primary);
    }

    .admin-card .card-body p {
        margin: 0.25rem 0;
        font-size: 0.95rem;
    }

    .admin-card .card-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
        flex-wrap: wrap;
    }

    .desktop-only { display: block; }
    .mobile-only { display: none; }

    @media (max-width: 768px) {
        .admin-container {
            padding: 1rem;
        }

        .desktop-only { display: none; }
        .mobile-only { display: block; }

        header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }

        h1 {
            font-size: 1.75rem;
        }

        .header-actions {
            width: 100%;
        }

        .admin-action-btn {
            flex: 1;
            text-align: center;
            padding: 0.5rem 1rem;
            font-size: 0.7rem;
        }

        .mt-4 {
            margin-top: 2rem;
        }
    }

    @keyframes slide-up-fade {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
