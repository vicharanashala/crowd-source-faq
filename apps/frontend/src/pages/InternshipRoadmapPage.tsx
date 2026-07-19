export default function InternshipRoadmapPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-8 shadow-lg">

        <h1 className="text-4xl font-bold text-blue-700">
          🚀 Internship Roadmap
        </h1>

        <p className="mt-3 text-gray-600">
          Follow this roadmap to successfully complete your internship from onboarding
          to project contribution.
        </p>

        <div className="mt-6">
          <div className="mb-2 flex justify-between">
            <span className="font-semibold">Overall Progress</span>
            <span>0%</span>
            
          </div>

          

          <div className="h-3 rounded-full bg-gray-200">
            <div className="h-3 w-0 rounded-full bg-blue-600"></div>

            <div className="mt-10 rounded-lg border p-6">
  <h2 className="text-2xl font-semibold text-gray-800">
    📋 Internship Onboarding Checklist
  </h2>

  <ul className="mt-4 space-y-3 text-gray-700">
    <li>✅ Log in to samagama.in</li>
    <li>✅ Upload and verify required documents (NOC, Offer Letter, Participation Agreement, Honor Code)</li>
    <li>✅ Submit your Zoom ID and GitHub ID</li>
    <li>✅ Join the daily Zoom stand-up meeting</li>
    <li>✅ Attend polls during the stand-up session</li>
  </ul>
</div>


<div className="mt-8 rounded-lg border p-6">
  <h2 className="text-2xl font-semibold text-gray-800">
    🎯 Eligibility Criteria
  </h2>

  <div className="mt-5 grid gap-4 md:grid-cols-3">
    <div className="rounded-lg bg-green-50 p-4 text-center shadow">
      <h3 className="text-lg font-semibold text-green-700">85%</h3>
      <p className="mt-2 text-gray-700">
        Stand-up Meeting Attendance
      </p>
    </div>

    <div className="rounded-lg bg-blue-50 p-4 text-center shadow">
      <h3 className="text-lg font-semibold text-blue-700">85%</h3>
      <p className="mt-2 text-gray-700">
        Poll Participation
      </p>
    </div>

    <div className="rounded-lg bg-yellow-50 p-4 text-center shadow">
      <h3 className="text-lg font-semibold text-yellow-700">50%</h3>
      <p className="mt-2 text-gray-700">
        Poll Accuracy
      </p>
    </div>
  </div>

  <p className="mt-5 text-red-600 font-medium">
    ⚠️ Students who do not meet the eligibility criteria may be excluded from the internship.
  </p>
</div>
          </div>
        </div>

      </div>
    </div>
  );
}