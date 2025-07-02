const PlaceholderPage = ({ title }: { title: string }) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="text-gray-600 dark:text-gray-300">Bu sayfanın içeriği yakında eklenecektir.</p>
      </div>
      <div className="card">
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">İçerik Hazırlanıyor...</p>
        </div>
      </div>
    </div>
  );
};

export default PlaceholderPage; 