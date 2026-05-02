import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cookieSession from "cookie-session";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Generic API Proxy for Fireant
  app.all("/api/fireant/*", async (req, res) => {
    try {
      const targetPath = req.params[0];
      const query = new URLSearchParams(req.query as any).toString();
      // Using betarest as requested by user for bond and profile data accuracy
      const baseUrl = "https://betarest.fireant.vn";
      const url = `${baseUrl}/${targetPath}${query ? `?${query}` : ""}`;
      
      console.log(`[Proxy] ${req.method} ${url}`);
      
      // Get a fresh token if not provided by client
      let token = req.headers.authorization;
      if (!token || token === 'Bearer undefined' || token === 'undefined' || token === 'Bearer null' || token === 'null') {
        token = await getFireantToken();
        if (token && !token.startsWith('Bearer ')) {
          token = `Bearer ${token}`;
        }
      }

      const fetchWithToken = async (authToken: string | undefined) => {
        const headers: any = {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://fireant.vn/',
          'Origin': 'https://fireant.vn',
          'X-Requested-With': 'XMLHttpRequest'
        };
        
        if (authToken) {
          headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
        }

        return await axios({
          method: req.method,
          url: url,
          headers,
          data: req.body,
          timeout: 20000,
          validateStatus: (status) => status < 500
        });
      };

      let response = await fetchWithToken(token);
      
      // If 401, try refreshing the token once
      if (response.status === 401) {
        console.log(`[Proxy] 401 detected for ${targetPath}, attempting server-side token refresh...`);
        const freshToken = await getFireantToken(true);
        if (freshToken) {
          response = await fetchWithToken(freshToken);
          console.log(`[Proxy] Retry for ${targetPath} resulted in status: ${response.status}`);
        } else {
          console.error(`[Proxy] Refresh failed for ${targetPath}`);
        }
      }
      
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error(`Error proxying Fireant [${req.method}] ${req.params[0]}:`, error.message);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: "Failed to proxy request", message: error.message });
      }
    }
  });

  // Server-side cache for news to handle slow source
  let newsCache: any = null;
  let lastCacheUpdate = 0;
  let isRefreshingNews = false;
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const FINANCE_FALLBACKS = [
    "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526303328184-bf7159787ca7?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1633156191771-7a55444e998b?q=80&w=800&auto=format&fit=crop"
  ];

  const getFallbackImage = (id: string | number) => {
    const idx = typeof id === 'number' ? id % FINANCE_FALLBACKS.length : (id.length % FINANCE_FALLBACKS.length);
    return FINANCE_FALLBACKS[idx];
  };

  const refreshNews = async (retryCount = 0): Promise<any[] | null> => {
    if (isRefreshingNews && retryCount === 0) return newsCache;
    isRefreshingNews = true;
    
    try {
      console.log(`[News] Refreshing news from Fireant (Attempt ${retryCount + 1})...`);
      const response = await axios.get("https://fireant.vn/bai-viet", {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        }
      });
      
      const html = response.data;
      const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIdx = html.indexOf(scriptTag);
      
      if (startIdx === -1) {
        throw new Error("Could not find __NEXT_DATA__ script tag");
      }
      
      const jsonStart = html.indexOf('{', startIdx);
      const scriptEndIdx = html.indexOf('</script>', jsonStart);
      const jsonStr = html.substring(jsonStart, scriptEndIdx);
      
      const data = JSON.parse(jsonStr);
      
      // Navigate through the Next.js state object to find the posts
      const newsStream = data?.props?.pageProps?.initialState?.posts?.posts?.NEWS_STREAM;
      const posts = newsStream?.posts;
      
      if (!posts || !Array.isArray(posts)) {
        throw new Error("Could not find posts array in __NEXT_DATA__");
      }

      // Map to our NewsItem format
      const mappedNews = posts.map((post: any) => {
        const title = post.title || "";
        const summary = post.description || post.summary || "";
        
        const extractImage = (p: any) => {
          let img = p.images?.[0]?.imageUrl || 
                    (p.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${p.images[0].imageID}` : null) ||
                    p.thumbnail || 
                    p.linkImage;
          
          if (!img) {
            const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
            const imgMatches = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
            if (imgMatches.length > 0) {
              const likelyImg = imgMatches.find(m => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
              img = likelyImg[1];
            }
          }

          if (img && typeof img === 'string') {
            if (img.startsWith('//')) img = `https:${img}`;
            else if (img.startsWith('/')) img = `https://static.fireant.vn${img}`;
          }
          return img;
        };

        let image = extractImage(post) || getFallbackImage(post.postID || 0);
        
        const allImages = (post.images || []).map((img: any) => {
          let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
          if (url && typeof url === 'string') {
            if (url.startsWith('//')) url = `https:${url}`;
            else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
          }
          return url;
        }).filter(Boolean);

        if (image && !allImages.includes(image)) {
          allImages.unshift(image);
        }

        return {
          id: post.postID?.toString() || `fa-${Date.now()}-${Math.random()}`,
          source: post.postSource?.name || post.user?.name || 'Fireant',
          sourceUrl: post.postSource?.url || null,
          title: title,
          summary: summary,
          content: post.content || post.originalContent || post.description || post.summary || title,
          author: post.user?.name || 'Fireant',
          image: image || globalFallbackImage,
          images: allImages,
          date: post.date,
          url: `https://fireant.vn/bai-viet/${post.postID}`,
          originalUrl: post.postSourceUrl || post.link || null,
          category: post.postGroup?.name || 'Thị trường'
        };
      });
      
      newsCache = mappedNews;
      lastCacheUpdate = Date.now();
      console.log(`[News] Successfully refreshed news (${mappedNews.length} items).`);
      isRefreshingNews = false;
      return mappedNews;
    } catch (error: any) {
      console.error(`[News] Refresh failed: ${error.message}`);
      
      if (retryCount < 2) {
        isRefreshingNews = false;
        return await refreshNews(retryCount + 1);
      }
      
      isRefreshingNews = false;
      return newsCache;
    }
  };

  // Initial fetch to populate cache on startup
  refreshNews();

  let fireantToken: string | null = null;
  let globalFallbackImage: string | null = "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=2070&auto=format&fit=crop";
  let lastTokenFetch = 0;

  async function getFireantToken(force = false) {
    const now = Date.now();
    
    // Only use env var if it exists and we don't have a better one or are forced
    if (process.env.FIREANT_ACCESS_TOKEN && !force) {
      if (!fireantToken || fireantToken !== process.env.FIREANT_ACCESS_TOKEN) {
        console.log("[Token] Adopting token from environment variable");
        fireantToken = process.env.FIREANT_ACCESS_TOKEN;
      }
      return fireantToken;
    }

    // Cache token and fallback image for 30 minutes, unless forced
    if (!force && fireantToken && (now - lastTokenFetch < 30 * 60 * 1000)) {
      return fireantToken;
    }

    try {
      console.log(`[Token] Fetching new access token (force=${force}, reason=${force ? 'Retry/Expiry' : 'Initial'})...`);
      const response = await axios.get('https://fireant.vn/bai-viet', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cache-Control': 'no-cache',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        },
        timeout: 8000 // Reduced for Vercel
      });
      const html = response.data;
      const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIdx = html.indexOf(scriptTag);
      
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const scriptEndIdx = html.indexOf('</script>', jsonStart);
        const jsonStr = html.substring(jsonStart, scriptEndIdx);
        const data = JSON.parse(jsonStr);
        
        // Enhanced token search - search recursively for tokens if common paths fail
        const findTokenRecursively = (obj: any, depth = 0): string | null => {
          if (!obj || typeof obj !== 'object' || depth > 10) return null;
          
          if (obj.accessToken && typeof obj.accessToken === 'string' && obj.accessToken.length > 20) return obj.accessToken;
          if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
          
          // Specifically check for __JWT__ or similar if Fireant changes naming
          if (obj.jwt && typeof obj.jwt === 'string' && obj.jwt.length > 20) return obj.jwt;
          
          for (const key in obj) {
            if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
              const res = findTokenRecursively(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return null;
        };

        const token = data?.props?.pageProps?.initialState?.auth?.accessToken || 
                      data?.props?.pageProps?.initialState?.auth?.token ||
                      findTokenRecursively(data);
        
        if (token) {
          fireantToken = token;
          lastTokenFetch = now;
          console.log(`[Token] Successfully obtained Fireant access token: ${token.substring(0, 15)}...`);
        } else {
          console.warn("[Token] Access token not found in __NEXT_DATA__ after search");
          // If we had a token but couldn't find a new one during force refresh, 
          // we might want to clear it if it's definitely dead, or keep it as a hail mary.
          if (force) fireantToken = null; 
        }

        // Try to get a fallback image
        const newsStream = data?.props?.pageProps?.initialState?.posts?.posts?.NEWS_STREAM;
        const firstPost = newsStream?.posts?.[0];
        if (firstPost) {
          let fallbackImg = firstPost.images?.[0]?.imageUrl || 
                            (firstPost.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${firstPost.images[0].imageID}` : null) ||
                            firstPost.thumbnail ||
                            firstPost.linkImage;
          
          if (fallbackImg) {
            if (typeof fallbackImg === 'string' && fallbackImg.startsWith('/')) {
              fallbackImg = `https://static.fireant.vn${fallbackImg}`;
            }
            globalFallbackImage = fallbackImg;
            console.log("[Token] Obtained global fallback image:", globalFallbackImage);
          }
        }
        
        return token;
      } else {
        console.error("[Token] Could not find __NEXT_DATA__ on Fireant main page");
      }
    } catch (error: any) {
      console.error("[Token] Failed to fetch Fireant token/image:", error.message);
    }
    return fireantToken;
  }

  // API to fetch full content for a specific post
  app.get("/api/news/:id", async (req, res) => {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ error: "Post ID is required" });

    const tryRestApi = async (token: string) => {
      // Try both restv2 and betarest (betarest is often more accurate/accessible)
      const endpoints = [
        `https://betarest.fireant.vn/posts/get-post?postID=${postId}`,
        `https://restv2.fireant.vn/posts/get-post?postID=${postId}`
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[News Detail] Fetching post ${postId} via ${new URL(endpoint).hostname}...`);
          const apiResponse = await axios.get(endpoint, {
            timeout: 10000,
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Origin': 'https://fireant.vn',
              'Referer': 'https://fireant.vn/'
            },
            validateStatus: (status) => status < 500
          });

          if (apiResponse.status === 200 && apiResponse.data) {
            return apiResponse.data;
          }
          
          if (apiResponse.status === 401) {
            throw { status: 401, message: 'Unauthorized' };
          }
        } catch (err: any) {
          if (err.status === 401 || err.response?.status === 401) throw err;
          console.log(`[News Detail] API ${endpoint} failed: ${err.message}`);
        }
      }
      return null;
    };

    try {
      // 1. Try REST API with token
      let token = await getFireantToken();
      let postData = null;
      
      if (token) {
        try {
          postData = await tryRestApi(token);
        } catch (apiError: any) {
          if (apiError.status === 401 || apiError.response?.status === 401) {
            console.log(`[News Detail] 401 Unauthorized for post ${postId}, refreshing token...`);
            const freshToken = await getFireantToken(true);
            if (freshToken) {
              try {
                postData = await tryRestApi(freshToken);
              } catch (retryError: any) {
                console.log(`[News Detail] Retry after 401 failed: ${retryError.message}`);
              }
            }
          } else {
            console.log(`[News Detail] REST API failed for post ${postId}: ${apiError.message}`);
          }
        }
      }

      if (postData) {
        const post = postData;
        const title = post.title || "";
        const summary = post.description || post.summary || "";
        
        // Image extraction logic
        const extractImage = (p: any) => {
          let img = p.images?.[0]?.imageUrl || 
                    (p.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${p.images[0].imageID}` : null) ||
                    p.thumbnail || 
                    p.linkImage;
          
          if (!img) {
            const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
            const imgMatches = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
            if (imgMatches.length > 0) {
              const likelyImg = imgMatches.find(m => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
              img = likelyImg[1];
            }
          }

          if (img && typeof img === 'string') {
            if (img.startsWith('//')) img = `https:${img}`;
            else if (img.startsWith('/')) img = `https://static.fireant.vn${img}`;
          }
          return img;
        };

        let image = extractImage(post) || getFallbackImage(postId);
        const allImages = (post.images || []).map((img: any) => {
          let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
          if (url && typeof url === 'string') {
            if (url.startsWith('//')) url = `https:${url}`;
            else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
          }
          return url;
        }).filter(Boolean);

        if (image && !allImages.includes(image)) {
          allImages.unshift(image);
        }
        
        return res.json({
          id: post.postID?.toString(),
          source: post.postSource?.name || post.user?.name || 'Fireant',
          sourceUrl: post.postSource?.url || null,
          title: title,
          summary: summary,
          content: post.content || post.originalContent || summary || title,
          author: post.user?.name || 'Fireant',
          image: image,
          images: allImages,
          date: post.date,
          url: `https://fireant.vn/bai-viet/${post.postID}`,
          originalUrl: post.postSourceUrl || post.link || null,
          category: post.postGroup?.name || 'Thị trường'
        });
      }

      // 2. Fallback to scraping if REST API fails
      console.log(`[News Detail] Falling back to scraping for post ${postId}...`);
      
      const scrapingUrls = [
        `https://fireant.vn/bai-viet/${postId}`,
        `https://fireant.vn/dashboard/bai-viet/${postId}`
      ];

      let scrapingResponse = null;
      for (const scrapUrl of scrapingUrls) {
        try {
          console.log(`[News Detail] Scraping URL: ${scrapUrl}`);
          scrapingResponse = await axios.get(scrapUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Referer': 'https://fireant.vn/',
              'Cache-Control': 'no-cache'
            },
            validateStatus: (status) => status === 200
          });
          if (scrapingResponse) break;
        } catch (err: any) {
          console.log(`[News Detail] Scraping ${scrapUrl} failed: ${err.message}`);
        }
      }
      
      if (scrapingResponse) {
        const html = scrapingResponse.data;
        const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
        const startIdx = html.indexOf(scriptTag);
        
        if (startIdx !== -1) {
          const jsonStart = html.indexOf('{', startIdx);
          const scriptEndIdx = html.indexOf('</script>', jsonStart);
          const jsonStr = html.substring(jsonStart, scriptEndIdx);
          const data = JSON.parse(jsonStr);
          const post = data?.props?.pageProps?.initialState?.posts?.post;
          
          if (post) {
            const title = post.title || "";
            const summary = post.description || post.summary || "";
            
            const extractImage = (p: any) => {
              let img = p.images?.[0]?.imageUrl || 
                        (p.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${p.images[0].imageID}` : null) ||
                        p.thumbnail || 
                        p.linkImage;
              
              if (!img) {
                const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
                const imgMatches = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
                if (imgMatches.length > 0) {
                  const likelyImg = imgMatches.find(m => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
                  img = likelyImg[1];
                }
              }

              if (img && typeof img === 'string') {
                if (img.startsWith('//')) img = `https:${img}`;
                else if (img.startsWith('/')) img = `https://static.fireant.vn${img}`;
              }
              return img;
            };

            let image = extractImage(post) || getFallbackImage(postId);
            let contentText = post.content || post.originalContent || summary || title;

            // If content is empty in JSON, try scraping from HTML
            if (!post.content || post.content.length < 100) {
              const contentMatches = [
                html.match(/<div id="post_content"[^>]*>([\s\S]*?)<\/div>\s*<div/),
                html.match(/<article[^>]*>([\s\S]*?)<\/article>/),
                html.match(/<div[^>]+class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/),
                html.match(/<main[^>]*>([\s\S]*?)<\/main>/)
              ];

              for (const match of contentMatches) {
                if (match && match[1] && match[1].length > 100) {
                  contentText = match[1];
                  break;
                }
              }

              // Fix images
              contentText = contentText.replace(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi, (match, src) => {
                let absoluteSrc = src;
                if (src.startsWith('//')) absoluteSrc = `https:${src}`;
                else if (src.startsWith('/')) absoluteSrc = `https://static.fireant.vn${src}`;
                
                if (match.includes('data-src=')) {
                  return match.replace(/data-src=["'][^"']+["']/i, `src="${absoluteSrc}"`);
                } else if (!match.includes('src=')) {
                  return match.replace('<img', `<img src="${absoluteSrc}"`);
                } else {
                  return match.replace(/src=["'][^"']+["']/i, `src="${absoluteSrc}"`);
                }
              });
            }

            const allImages = (post.images || []).map((img: any) => {
              let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
              if (url && typeof url === 'string') {
                if (url.startsWith('//')) url = `https:${url}`;
                else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
              }
              return url;
            }).filter(Boolean);

            if (allImages.length <= 1) {
              const contentImgMatches = Array.from(contentText.matchAll(/<img[^>]+src=["']([^"'\s>]+)["']/gi));
              contentImgMatches.forEach(m => {
                if (m[1] && !allImages.includes(m[1]) && !m[1].includes('icon') && !m[1].includes('logo')) {
                  allImages.push(m[1]);
                }
              });
            }

            if (image === getFallbackImage(postId) && allImages.length > 0) {
              image = allImages[0];
            }

            if (image && !allImages.includes(image)) {
              allImages.unshift(image);
            }

            return res.json({
              id: post.postID?.toString(),
              source: post.postSource?.name || post.user?.name || 'Fireant',
              sourceUrl: post.postSource?.url || null,
              title: title,
              summary: summary,
              content: contentText,
              author: post.user?.name || 'Fireant',
              image: image,
              images: allImages,
              date: post.date,
              url: `https://fireant.vn/bai-viet/${post.postID}`,
              originalUrl: post.postSourceUrl || post.link || null,
              category: post.postGroup?.name || 'Thị trường'
            });
          }
        }
      }

      // 3. Last Resort: Cache or 404
      if (newsCache) {
        const cachedPost = newsCache.find((p: any) => p.id === postId);
        if (cachedPost) return res.json(cachedPost);
      }
      
      res.status(404).json({ error: "Post content not found" });
    } catch (error: any) {
      console.error(`[News Detail] Fatal error for ${postId}:`, error.message);
      res.status(500).json({ error: "Failed to fetch post content" });
    }
  });

  // API Proxy for News List
  app.get("/api/news", async (req, res) => {
    const now = Date.now();
    
    // If cache is fresh, return it
    if (newsCache && (now - lastCacheUpdate < CACHE_TTL)) {
      return res.json(newsCache);
    }
    
    // If cache is stale or missing, try to refresh
    console.log(`[News List] ${newsCache ? 'Cache stale' : 'Cache missing'}, fetching fresh news...`);
    try {
      const news = await refreshNews();
      return res.json(news || []);
    } catch (err) {
      return res.json(newsCache || []);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
