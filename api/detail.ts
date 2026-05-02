import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

async function getFireantToken() {
  if (process.env.FIREANT_ACCESS_TOKEN) return process.env.FIREANT_ACCESS_TOKEN;
  try {
    const response = await axios.get('https://fireant.vn/bai-viet', { timeout: 8000 });
    const html = response.data;
    const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
    if (startIdx !== -1) {
      const jsonStart = html.indexOf('{', startIdx);
      const jsonEnd = html.indexOf('</script>', jsonStart);
      const data = JSON.parse(html.substring(jsonStart, jsonEnd));
      return data?.props?.pageProps?.initialState?.auth?.accessToken || data?.props?.pageProps?.initialState?.auth?.token;
    }
  } catch (e) {}
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    const token = await getFireantToken();
    let post = null;

    if (token) {
      const apiResponse = await axios.get(`https://restv2.fireant.vn/posts/get-post?postID=${id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 8000
      });
      if (apiResponse.data) post = apiResponse.data;
    }

    if (!post) {
      const response = await axios.get(`https://fireant.vn/bai-viet/${id}`, { timeout: 10000 });
      const html = response.data;
      const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const jsonEnd = html.indexOf('</script>', jsonStart);
        const data = JSON.parse(html.substring(jsonStart, jsonEnd));
        post = data?.props?.pageProps?.initialState?.posts?.post;
      }
    }

    if (!post) return res.status(404).json({ error: "Post not found" });

    const allImages = (post.images || []).map((img: any) => {
      let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
      if (url && typeof url === 'string') {
        if (url.startsWith('//')) url = `https:${url}`;
        else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
      }
      return url;
    }).filter(Boolean);

    const image = (post.images?.[0]?.imageUrl || 
                  (post.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${post.images[0].imageID}` : null) || 
                  post.thumbnail || 
                  post.linkImage);

    return res.status(200).json({
      id: post.postID?.toString(),
      source: post.postSource?.name || post.user?.name || 'Fireant',
      sourceUrl: post.postSource?.url || null,
      title: post.title,
      summary: post.description || post.summary,
      content: post.content || post.originalContent || post.description || post.summary,
      author: post.user?.name || 'Fireant',
      image: image,
      images: allImages,
      date: post.date,
      url: `https://fireant.vn/bai-viet/${post.postID}`,
      originalUrl: post.postSourceUrl || post.link || null,
      category: post.postGroup?.name || 'Thị trường'
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
