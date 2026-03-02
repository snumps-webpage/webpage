<script lang="ts">
	let { name = '', department = '', email = '' } = $props();
</script>

<li class="paper-section">
	<h2 class="paper-section-title">Metadata</h2>
	<div class="paper-field">
		<label for="name" class="paper-label">이름</label>
		<input type="text" id="name" value={name} disabled />
	</div>
	<div class="paper-field">
		<label for="department" class="paper-label">학과</label>
		<input type="text" id="department" value={department} disabled />
	</div>
	<div class="paper-field">
		<label for="email" class="paper-label">이메일</label>
		<input type="text" id="email" value={email} disabled />
	</div>
</li>
